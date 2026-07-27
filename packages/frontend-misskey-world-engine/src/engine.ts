/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as BABYLON from '@babylonjs/core/pure.js';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic.js';
import { cm, WORLD_SCALE } from 'misskey-world/src/utility.js';
import { FreeCameraManualInput, GRAPHICS_QUALITY, Timer } from './utility.js';
import { TIME_MAP } from './utility.js';
import { EngineBase } from './EngineBase.js';
import { LobbyEnvManager } from './envs/lobby.js';
import type { PlayerContainer, PlayerProfile, PlayerState } from './PlayerContainer.js';
import type { WorldEnvManager } from './env.js';

const IN_WEB_WORKER = typeof window === 'undefined';

export class WorldEngine extends EngineBase<{
	'changeMyPlayerState': (ctx: PlayerState) => void;
	'playerPointed': (ctx: { playerId: string; }) => void;
	'playSfxUrl': (ctx: {
		url: string;
		options: {
			volume: number;
			playbackRate: number;
		};
	}) => void;
	'loadingProgress': (ctx: { progress: number }) => void;
	'contextlost': (ctx: { reason: string; message: string; }) => void;
}> {
	public camera: BABYLON.UniversalCamera;
	private time: 0 | 1 | 2 = 0; // 0: 昼, 1: 夕, 2: 夜
	private envMap: BABYLON.CubeTexture;
	public lightContainer: BABYLON.ClusteredLightContainer;
	public sr: BABYLON.SnapshotRenderingHelper;
	private gl: BABYLON.GlowLayer | null = null;
	public timer: Timer = new Timer();
	public isSitting = false;
	private cameraHeight = cm(130);
	private fov: number;
	private useGlow: boolean;
	public graphicsQuality: number;
	private playerProfiles: Record<string, PlayerProfile> = {};
	private playerContainers: PlayerContainer[] = [];
	private showUsernameOnAvatar: boolean;
	private show2dAvatarOnAvatar: boolean;
	private envManager: WorldEnvManager | null = null;
	private inited = false;

	constructor(options: {
		engine: BABYLON.WebGPUEngine;
		graphicsQuality: number;
		fps: number | null;
		antialias: boolean;
		fov: number;
		useVirtualJoystick?: boolean;
		showUsernameOnAvatar: boolean;
		show2dAvatarOnAvatar: boolean;
	}) {
		super({
			engine: options.engine,
			fps: options.fps,
		});

		this.graphicsQuality = options.graphicsQuality;
		this.useGlow = this.graphicsQuality >= GRAPHICS_QUALITY.MEDIUM;
		this.fov = options.fov;
		this.showUsernameOnAvatar = options.showUsernameOnAvatar;
		this.show2dAvatarOnAvatar = options.show2dAvatarOnAvatar;

		registerBuiltInLoaders();

		this.scene.autoClear = false;
		//this.scene.autoClearDepthAndStencil = false;
		this.scene.skipPointerMovePicking = true;
		this.scene.skipFrustumClipping = true; // snapshot renderingでは全てのメッシュがアクティブになっている必要があるため
		this.scene.gravity = new BABYLON.Vector3(0, -0.1, 0).scale(WORLD_SCALE);
		this.scene.collisionsEnabled = true;

		this.sr = new BABYLON.SnapshotRenderingHelper(this.scene);

		const skybox = BABYLON.MeshBuilder.CreateBox('skybox', { size: cm(50000) }, this.scene);
		const skyboxMat = new BABYLON.StandardMaterial('skyboxMat', this.scene);
		skyboxMat.backFaceCulling = false;
		skyboxMat.disableLighting = true;
		skybox.material = skyboxMat;
		skybox.infiniteDistance = true;

		this.time = TIME_MAP[new Date().getHours() as keyof typeof TIME_MAP];
		//this.time = TIME_MAP[12 as keyof typeof TIME_MAP];

		if (this.time === 0) {
			skyboxMat.emissiveColor = new BABYLON.Color3(1, 1, 1);
		} else if (this.time === 1) {
			skyboxMat.emissiveColor = new BABYLON.Color3(0.7, 0.68, 0.66);
		} else {
			skyboxMat.emissiveColor = new BABYLON.Color3(0.48, 0.5, 0.6);
		}
		this.scene.ambientColor = new BABYLON.Color3(0.9, 0.9, 0.9);

		this.envMap = BABYLON.CubeTexture.CreateFromPrefilteredData(this.time === 2 ? '/client-assets/room/outdoor-night.env' : '/client-assets/room/outdoor-day.env', this.scene);
		//this.envMap.level = 1;
		this.envMap.level = 0;

		this.camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, this.cameraHeight, cm(0)), this.scene);
		this.camera.minZ = cm(1);
		this.camera.maxZ = cm(1000);
		this.camera.fov = this.fov;
		this.camera.ellipsoid = new BABYLON.Vector3(cm(15), cm(65), cm(15));
		this.camera.checkCollisions = true;
		this.camera.applyGravity = true;
		this.camera.needMoveForGravity = true;
		this.camera.inputs.clear();
		if (options.useVirtualJoystick) {
			this.camera.inputs.add(new FreeCameraManualInput(this.scene, {
				moveSensitivity: 0.015 * WORLD_SCALE,
				rotationSensitivity: 0.0007,
			}));
			this.camera.inertia = 0.75;
		} else {
			this.camera.inputs.add(new FreeCameraManualInput(this.scene, {
				moveSensitivity: 0.002 * WORLD_SCALE,
				rotationSensitivity: 0.0003,
			}));
		}

		this.scene.activeCamera = this.camera;

		this.lightContainer = new BABYLON.ClusteredLightContainer('clustered', [], this.scene);
		this.lightContainer.maxRange = cm(1000);
		this.lightContainer.verticalTiles = 32;
		this.lightContainer.horizontalTiles = 32;
		this.lightContainer.depthSlices = 32;

		if (this.useGlow) {
			this.gl = new BABYLON.GlowLayer('glow', this.scene, {
				//mainTextureFixedSize: 512,
				blurKernelSize: 64,
			});
			this.gl.intensity = 0.5;
			this.gl.addExcludedMesh(skybox);
			this.scene.setRenderingAutoClearDepthStencil(this.gl.renderingGroupId, false);
			this.sr.updateMeshesForEffectLayer(this.gl);
		}
	}

	public async init() {
		await this.loadEnv();

		this.startRenderLoop();

		await this.scene.whenReadyAsync();

		// 必ずシーンが少なくとも1フレームレンダリングがされてから呼ばれるように注意すること。そうしないとタイミングによってはエンジンがクラッシュする
		this.sr.enableSnapshotRendering();

		this.inputs.on('wheel', (ev) => {
			if (this.scene.activeCamera === this.camera) {
				this.camera.fov += ev.deltaY * 0.001;
				this.camera.fov = Math.max(0.25, Math.min(this.fov, this.camera.fov));
			}
		});

		this.inputs.on('zoom', (ev) => {
			if (this.scene.activeCamera === this.camera) {
				this.camera.fov += -ev.delta * 0.003;
				this.camera.fov = Math.max(0.25, Math.min(this.fov, this.camera.fov));
			}
		});

		this.inputs.on('click', (ev) => {
			// TODO: GPUPickerを使いたいが、なぜか一部のメッシュが反応しない
			const pickingInfo = this.scene.pick(ev.x, ev.y,
				(m) => m.name.includes('__PICK__') || m.metadata?.isPlayer || (m.isVisible && m.isEnabled() && m.metadata?.furnitureId != null && this.furnitureContainers.has(m.metadata.furnitureId)));

			if (pickingInfo.pickedMesh != null) {
				const playerId = pickingInfo.pickedMesh.metadata.playerId;
				if (playerId != null && this.playerContainers.some(c => c.id === playerId)) {
					const c = this.playerContainers.find(c => c.id === playerId)!;
					this.look(c.root.position);
					this.ev('playerPointed', { playerId });
					return;
				}
			}
		});

		this.inputs.on('pointer', (ev) => {
			if (this.scene.activeCamera === this.camera) {
				(this.camera.inputs.attached.manual as FreeCameraManualInput).setRotationVector({ x: ev.x, y: ev.y });
			}
		});

		this.timer.setInterval(() => {
			const camera = this.scene.activeCamera!;
			const myPos = camera.globalPosition;
			const myRotation = camera.absoluteRotation.toEulerAngles();
			this.ev('changeMyPlayerState', {
				position: [myPos.x, myPos.y, myPos.z],
				rotation: [myRotation.x, myRotation.y, myRotation.z],
			});
		}, 100);

		this.inited = true;
	}

	private async loadEnv() {
		const envManager = new LobbyEnvManager(this);

		await envManager.load();
		envManager.setTime(this.time);

		for (const mat of this.scene.materials) {
			mat.unfreeze();
			if (mat instanceof BABYLON.MultiMaterial) {
				for (const subMat of mat.subMaterials) {
					if (subMat.metadata?.useEnvMap) subMat.reflectionTexture = envManager.envMapIndoor;
				}
			} else {
				if (mat.metadata?.useEnvMap) mat.reflectionTexture = envManager.envMapIndoor;
			}
		}

		this.envManager = envManager;

		this.camera.maxZ = this.envManager.maxCameraZ;
	}

	public cameraMove(vector: { x: number; y: number; }, dash: boolean) {
		(this.camera.inputs.attached.manual as FreeCameraManualInput).setMoveVector(dash ? { x: vector.x * 3, y: vector.y * 3 } : vector);
	}

	public cameraJoystickMove(vector: { x: number; y: number; }) {
		(this.camera.inputs.attached.manual as FreeCameraManualInput).setMoveVector(vector);
	}

	private playSfxUrl(url: string, options: { volume: number; playbackRate: number }) {
		this.emit('playSfxUrl', { url, options });
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

	public resize() {
		this.engine.resize(true);
	}

	public destroy() {
		super.destroy();
		this.timer.dispose();
		this.envManager.dispose();
	}
}
