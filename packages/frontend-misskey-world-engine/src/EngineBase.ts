/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as BABYLON from '@babylonjs/core/pure.js';
import EventEmitter from 'eventemitter3';
import { PlayerContainer, type PlayerProfile, type PlayerState } from './PlayerContainer.js';

const IN_WEB_WORKER = typeof window === 'undefined';

export type EngineBaseEvents = {
	'loadingProgress': (ctx: { progress: number }) => void;
	'contextlost': (ctx: { reason: string; message: string; }) => void;
};

export abstract class EngineBase<EVs extends EngineBaseEvents> extends EventEmitter<{
	'ev': (ctx: { type: keyof EVs; ctx: Parameters<EVs[keyof EVs]>[0] }) => void;
}> {
	declare _eventTypes?: EVs;

	protected engine: BABYLON.WebGPUEngine;
	public scene: BABYLON.Scene;
	abstract sr: BABYLON.SnapshotRenderingHelper;
	abstract lightContainer: BABYLON.ClusteredLightContainer;
	abstract getEnvMap(): BABYLON.CubeTexture | null;
	protected fps: number | null = null;
	protected disposed = false;

	protected playerProfiles: Record<string, PlayerProfile> = {};
	protected playerContainers: PlayerContainer[] = [];
	protected showUsernameOnAvatar: boolean;
	protected show2dAvatarOnAvatar: boolean;

	public inputs: EventEmitter<{
		'click': (event: { x: number; y: number; }) => void;
		'keydown': (event: { code: string; shiftKey: boolean; }) => void;
		'keyup': (event: { code: string; shiftKey: boolean; }) => void;
		'wheel': (event: { deltaY: number; }) => void;
		'zoom': (event: { delta: number; }) => void;
		'pointer': (event: { x: number; y: number; }) => void;
	}> = new EventEmitter();

	constructor(options: {
		engine: BABYLON.WebGPUEngine;
		fps: number | null;
	}) {
		super();

		this.fps = options.fps;

		this.engine = options.engine;
		// doNotHandleContextLostがtrueだとそもそも呼ばれない
		//babylonEngine.onContextLostObservable.add(() => {
		//	os.alert({
		//		type: 'error',
		//		title: i18n.ts.somethingHappened,
		//		text: i18n.ts._miWorld.crushed_description,
		//	});
		//});
		this.engine._device.lost.then((info) => { // TODO: babylonEngineの内部プロパティに依存しない方法をforumで聞く
			this.ev('contextlost', { reason: info.reason, message: info.message }); // transferableじゃないデータが含まれている可能性も考慮してinfoそのままは送らない
		});

		this.scene = new BABYLON.Scene(this.engine);
	}

	private currentRafId: number | null = null;

	protected startRenderLoop() {
		if (this.fps == null) {
			this.engine.runRenderLoop(() => {
				this.scene.render();
			});
		} else {
			let then = 0;
			const interval = 1000 / this.fps;

			const renderLoop = (timeStamp: number) => {
				if (this.disposed) return;

				// workerで実行される可能性がある
				this.currentRafId = requestAnimationFrame(renderLoop);

				const delta = timeStamp - then;
				if (delta <= interval) return;
				then = timeStamp - (delta % interval);

				this.engine.beginFrame();
				this.scene.render();
				this.engine.endFrame();
			};

			// workerで実行される可能性がある
			this.currentRafId = requestAnimationFrame(renderLoop);
		}
	}

	public pauseRender() { // TODO: srと同じく参照カウント方式にした方が便利そう
		this.engine.stopRenderLoop();
		if (this.currentRafId != null) {
			// workerで実行される可能性がある
			cancelAnimationFrame(this.currentRafId);
			this.currentRafId = null;
		}
	}

	public resumeRender() {
		this.startRenderLoop();
	}

	public abstract init(): Promise<void>;

	protected ev<K extends keyof EVs>(type: K, ctx: Parameters<EVs[K]>[0]) {
		this.emit('ev', { type, ctx });
	}

	public async takeScreenshot() {
		return await BABYLON.Tools.CreateScreenshotAsync(this.engine, this.scene.activeCamera!, { precision: 1 });
	}

	public abstract resize(): void;

	public updatePlayerProfiles(profiles: Record<string, PlayerProfile>) {
		this.playerProfiles = profiles;

		for (const playerContainer of this.playerContainers) {
			if (this.playerProfiles[playerContainer.id] == null) {
				this.sr.disableSnapshotRendering();
				playerContainer.destroy();
				this.sr.enableSnapshotRendering();
			}
		}
		this.playerContainers = this.playerContainers.filter(p => this.playerProfiles[p.id] != null);
	}

	public updatePlayerStates(states: Record<string, PlayerState>) {
		for (const [k, v] of Object.entries(this.playerProfiles)) {
			const playerContainer = this.playerContainers.find(p => p.id === k);
			if (playerContainer == null) {
				const p = new PlayerContainer({
					id: k,
					profile: v,
					state: states[k],
					scene: this.scene,
					sr: this.sr,
					showUsername: this.showUsernameOnAvatar,
					show2dAvatar: this.show2dAvatarOnAvatar,
				});
				// TODO: loadFurnitureのものとある程度共通化
				p.registerMeshes = (meshes) => {
					for (const mesh of meshes) {
						mesh.receiveShadows = false;
						mesh.metadata = { isPlayer: true, playerId: k };

						//if (mesh.material) (mesh.material as BABYLON.PBRMaterial).ambientColor = new BABYLON.Color3(0.2, 0.2, 0.2);
						if (mesh.material) {
							if (mesh.material instanceof BABYLON.MultiMaterial) {
								for (const subMat of mesh.material.subMaterials) {
									if ((subMat as BABYLON.PBRMaterial).subSurface.isRefractionEnabled) {
										(subMat as BABYLON.PBRMaterial).subSurface.isRefractionEnabled = false; // 有効にするとドローコールが激増する
										(subMat as BABYLON.PBRMaterial).transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
										(subMat as BABYLON.PBRMaterial).alpha = 0.5;
										(subMat as BABYLON.PBRMaterial).metallic = 1;
									}
									(subMat as BABYLON.PBRMaterial).reflectionTexture = this.getEnvMap();
									if ((subMat as BABYLON.PBRMaterial).metadata == null) (subMat as BABYLON.PBRMaterial).metadata = {};
									(subMat as BABYLON.PBRMaterial).metadata.useEnvMap = true;
									(subMat as BABYLON.PBRMaterial).useGLTFLightFalloff = true; // Clustered Lightingではphysical falloffを持つマテリアルはアーチファクトが発生する https://doc.babylonjs.com/features/featuresDeepDive/lights/clusteredLighting/#materials-with-a-physical-falloff-may-cause-artefacts
									(subMat as BABYLON.PBRMaterial).anisotropy.isEnabled = false; // なんかきれいにレンダリングされないため
								}
							} else {
								if ((mesh.material as BABYLON.PBRMaterial).subSurface.isRefractionEnabled) {
									(mesh.material as BABYLON.PBRMaterial).subSurface.isRefractionEnabled = false; // 有効にするとドローコールが激増する
									(mesh.material as BABYLON.PBRMaterial).transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
									(mesh.material as BABYLON.PBRMaterial).alpha = 0.5;
									(mesh.material as BABYLON.PBRMaterial).metallic = 1;
								}
								(mesh.material as BABYLON.PBRMaterial).reflectionTexture = this.getEnvMap();
								if ((mesh.material as BABYLON.PBRMaterial).metadata == null) (mesh.material as BABYLON.PBRMaterial).metadata = {};
								(mesh.material as BABYLON.PBRMaterial).metadata.useEnvMap = true;
								(mesh.material as BABYLON.PBRMaterial).useGLTFLightFalloff = true; // Clustered Lightingではphysical falloffを持つマテリアルはアーチファクトが発生する https://doc.babylonjs.com/features/featuresDeepDive/lights/clusteredLighting/#materials-with-a-physical-falloff-may-cause-artefacts
								(mesh.material as BABYLON.PBRMaterial).anisotropy.isEnabled = false; // なんかきれいにレンダリングされないため
							}
						}

						if (!this.scene.meshes.includes(mesh)) this.scene.addMesh(mesh);
					}
				};
				p.loadAvatar().then(() => {
					this.sr.disableSnapshotRendering();
					this.sr.enableSnapshotRendering();
				});
				this.playerContainers.push(p);
			} else {
				if (states[k] != null) {
					playerContainer.applyState(states[k]);
				}
			}
		}
	}

	public clearPlayers() {
		this.sr.disableSnapshotRendering();
		for (const playerContainer of this.playerContainers) {
			playerContainer.destroy();
		}
		this.sr.enableSnapshotRendering();
		this.playerContainers = [];
	}

	public updateAvatarDisplayOptions(options: { showUsername: boolean; show2dAvatar: boolean }) {
		this.showUsernameOnAvatar = options.showUsername;
		this.show2dAvatarOnAvatar = options.show2dAvatar;

		this.sr.disableSnapshotRendering();
		for (const playerContainer of this.playerContainers) {
			playerContainer.updateUserInfoDisplayOptions(options);
		}
		this.sr.enableSnapshotRendering();
	}

	public destroy() {
		this.engine.stopRenderLoop();
		if (this.currentRafId != null) {
			// workerで実行される可能性がある
			cancelAnimationFrame(this.currentRafId);
			this.currentRafId = null;
		}
		for (const playerContainer of this.playerContainers) {
			playerContainer.destroy();
		}
		this.engine.dispose();
		this.scene.dispose();
		this.disposed = true;
	}
}
