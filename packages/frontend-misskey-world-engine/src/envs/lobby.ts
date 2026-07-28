/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as BABYLON from '@babylonjs/core/pure.js';
import { cm, WORLD_SCALE } from 'misskey-world/src/utility.js';
import tinycolor from 'tinycolor2';
import Hls from 'hls.js';
import { findMaterial, GRAPHICS_QUALITY, Timer } from '../utility.js';
import { WorldEnvManager } from '../env.js';
import { RecyvlingTextGrid, createPlaneUvMapper, randomRange } from '../utility.js';
import type { WorldEngine } from '../engine.js';

export class LobbyEnvManager extends WorldEnvManager {
	private loaderResult: BABYLON.ISceneLoaderAsyncResult | null = null;
	private meshes: BABYLON.Mesh[] = [];
	private skybox: BABYLON.Mesh | null = null;
	private skyboxMat: BABYLON.StandardMaterial | null = null;
	private sunLight: BABYLON.DirectionalLight | null = null;
	public envMapIndoor: BABYLON.CubeTexture | null = null;
	public maxCameraZ = cm(100000);
	private textMaterial: BABYLON.StandardMaterial | null = null;
	private translucentTextMaterial: BABYLON.StandardMaterial | null = null;
	private timer: Timer = new Timer();

	constructor(engine: WorldEngine) {
		super(engine);
	}

	public async load() {
		this.engine.camera.position = new BABYLON.Vector3(cm(0), cm(250), cm(3000));

		this.skybox = BABYLON.MeshBuilder.CreateBox('skybox', { size: cm(50000) }, this.engine.scene);
		this.skyboxMat = new BABYLON.StandardMaterial('skyboxMat', this.engine.scene);
		this.skyboxMat.backFaceCulling = false;
		this.skyboxMat.disableLighting = true;
		this.skybox.material = this.skyboxMat;
		this.skybox.infiniteDistance = true;
		this.engine.gl!.addExcludedMesh(this.skybox);

		const ambientLight1 = new BABYLON.HemisphericLight('ambientLight1', new BABYLON.Vector3(0, 1, 0), this.engine.scene);
		ambientLight1.diffuse = new BABYLON.Color3(1.0, 0.9, 0.8);
		ambientLight1.intensity = 1;
		const ambientLight2 = new BABYLON.HemisphericLight('ambientLight2', new BABYLON.Vector3(0, -1, 0), this.engine.scene);
		ambientLight2.diffuse = new BABYLON.Color3(0.8, 0.9, 1.0);
		ambientLight2.intensity = 1;
		//ambientLight.intensity = 0;

		this.sunLight = new BABYLON.DirectionalLight('sunLight', new BABYLON.Vector3(0, -1, 0), this.engine.scene);
		this.sunLight.position = new BABYLON.Vector3(cm(0), cm(10000), cm(0));
		this.sunLight.shadowMinZ = cm(1000);
		this.sunLight.shadowMaxZ = cm(2000);

		this.loaderResult = await BABYLON.ImportMeshAsync('/client-assets/world/envs/lobby/lobby.glb', this.engine.scene);

		//this.envMapIndoor = BABYLON.CubeTexture.CreateFromPrefilteredData('/client-assets/room/indoor.env', this.engine.scene);
		//this.envMapIndoor.boundingBoxSize = new BABYLON.Vector3(cm(500), cm(500), cm(500));

		this.meshes = this.loaderResult.meshes;
		this.meshes[0].scaling = this.meshes[0].scaling.scale(WORLD_SCALE);
		this.meshes[0].rotationQuaternion = null;
		this.meshes[0].rotation = new BABYLON.Vector3(0, 0, 0);
		this.meshes[0].bakeCurrentTransformIntoVertices();

		for (const mesh of this.meshes) {
			if (['__COLLISION__'].some(name => mesh.name.includes(name))) continue;
			mesh.receiveShadows = true;

			this.addShadowCaster(mesh);
		}

		this.textMaterial = new BABYLON.StandardMaterial('textMaterial', this.engine.scene);
		this.textMaterial.diffuseTexture = new BABYLON.Texture('/client-assets/world/chars.png', this.engine.scene, false, false);
		this.textMaterial.diffuseTexture.hasAlpha = true;
		this.textMaterial.disableLighting = true;
		this.textMaterial.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
		this.textMaterial.useAlphaFromDiffuseTexture = true;
		this.textMaterial.freeze();

		this.translucentTextMaterial = this.textMaterial.clone('translucentTextMaterial');
		this.translucentTextMaterial.alpha = 0.25;

		{
			const objet = this.meshes.find(m => m.name.includes('__OBJET__'));
			objet.rotation = objet.rotationQuaternion.toEulerAngles();
			objet.rotationQuaternion = null;

			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: 0 },
				{ frame: 5000, value: -(Math.PI * 2) },
			]);
			objet.animations = [anim];
			this.engine.scene.beginAnimation(objet, 0, 5000, true);

			this.engine.scene.onAfterAnimationsObservable.add(() => {
				this.engine.sr.updateMesh([objet, ...objet.getChildMeshes()], false);
			});
		}

		{
			const ring = this.meshes.find(m => m.name.includes('__LED_RING__'));
			ring.rotation = ring.rotationQuaternion.toEulerAngles();
			ring.rotationQuaternion = null;

			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: 0 },
				{ frame: 5000, value: -(Math.PI * 2) },
			]);
			ring.animations = [anim];
			this.engine.scene.beginAnimation(ring, 0, 5000, true);

			this.engine.scene.onAfterAnimationsObservable.add(() => {
				this.engine.sr.updateMesh([ring, ...ring.getChildMeshes()], false);
			});
		}

		{
			const messageRingRoot = new BABYLON.TransformNode('', this.engine.scene);
			const messageRing = this.meshes.find(m => m.name.includes('__MESSAGE_RING_OUTER_1__'));
			messageRing.parent = messageRingRoot;
			messageRing.rotation = messageRing.rotationQuaternion.toEulerAngles();
			messageRing.rotationQuaternion = null;
			const text = new RecyvlingTextGrid(messageRing, 256, {
				meshFlipped: true,
				material: this.textMaterial,
			});

			text.write('Wellcome to Misskey World!');

			//messageRingRoot.rotation.x = Math.PI / 4;

			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: 0 },
				{ frame: 10000, value: -(Math.PI * 2) },
			]);
			messageRing.animations = [anim];
			this.engine.scene.beginAnimation(messageRing, 0, 10000, true);

			this.engine.scene.onAfterAnimationsObservable.add(() => {
				this.engine.sr.updateMesh([messageRing, ...messageRing.getChildMeshes()], false);
			});

			const texts = [
				'Wellcome to Misskey World!',
				'Enjoy your stay!',
				'Feel free to look around!',
				'This is a virtual space for Misskey users!',
				//'You can chat, play games, and more!',
				//'Check out the bulletin board for announcements',
				'Have a nice day with Misskey!',
				'MAINTENANCE will begin at 9:00 A.M.',
			];

			let currentTextIndex = 1;

			this.timer.setInterval(() => {
				const textToShow = texts[currentTextIndex];
				currentTextIndex = (currentTextIndex + 1) % texts.length;
				text.writeWithAnimation(textToShow);
			}, 10000);
		}

		{
			const messageRingRoot = new BABYLON.TransformNode('', this.engine.scene);
			const messageRing = this.meshes.find(m => m.name.includes('__MESSAGE_RING_OUTER_2__'));
			messageRing.parent = messageRingRoot;
			messageRing.rotation = messageRing.rotationQuaternion.toEulerAngles();
			messageRing.rotationQuaternion = null;
			const text = new RecyvlingTextGrid(messageRing, 256, {
				meshFlipped: true,
				material: this.translucentTextMaterial,
				repeatSeparator: '   ',
			});

			messageRingRoot.rotation.x = Math.PI / 2;

			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: 0 },
				{ frame: 10000, value: -(Math.PI * 2) },
			]);
			messageRing.animations = [anim];
			this.engine.scene.beginAnimation(messageRing, 0, 10000, true);

			this.engine.scene.onAfterAnimationsObservable.add(() => {
				this.engine.sr.updateMesh([messageRing, ...messageRing.getChildMeshes()], false);
			});

			this.timer.setInterval(() => {
				text.write(Date.now().toString());
			}, 10);
		}

		{
			const messageRingRoot = new BABYLON.TransformNode('', this.engine.scene);
			const messageRing = this.meshes.find(m => m.name.includes('__MESSAGE_RING_INNER_1__'));
			messageRing.parent = messageRingRoot;
			messageRing.rotation = messageRing.rotationQuaternion.toEulerAngles();
			messageRing.rotationQuaternion = null;
			const text = new RecyvlingTextGrid(messageRing, 64, {
				material: this.textMaterial,
				repeatSeparator: '  ',
			});

			//messageRingRoot.rotation.x = Math.PI / 4;

			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: 0 },
				{ frame: 10000, value: (Math.PI * 2) },
			]);
			messageRing.animations = [anim];
			this.engine.scene.beginAnimation(messageRing, 0, 10000, true);

			this.engine.scene.onAfterAnimationsObservable.add(() => {
				this.engine.sr.updateMesh([messageRing, ...messageRing.getChildMeshes()], false);
			});

			this.timer.setInterval(() => {
				const now = new Date();
				const hours = now.getHours().toString().padStart(2, '0');
				const minutes = now.getMinutes().toString().padStart(2, '0');
				const seconds = now.getSeconds().toString().padStart(2, '0');
				text.write(`${hours}:${minutes}:${seconds}`);
			}, 1000);
		}

		{
			const messageRingRoot = new BABYLON.TransformNode('', this.engine.scene);
			const messageRing = this.meshes.find(m => m.name.includes('__MESSAGE_RING_INNER_2__'));
			messageRing.parent = messageRingRoot;
			messageRing.rotation = messageRing.rotationQuaternion.toEulerAngles();
			messageRing.rotationQuaternion = null;
			const text = new RecyvlingTextGrid(messageRing, 64, {
				material: this.textMaterial,
				repeatSeparator: '  ',
			});

			//messageRingRoot.rotation.x = Math.PI / 4;

			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: 0 },
				{ frame: 10000, value: -(Math.PI * 2) },
			]);
			messageRing.animations = [anim];
			this.engine.scene.beginAnimation(messageRing, 0, 10000, true);

			this.engine.scene.onAfterAnimationsObservable.add(() => {
				this.engine.sr.updateMesh([messageRing, ...messageRing.getChildMeshes()], false);
			});

			this.timer.setInterval(() => {
				const now = new Date();
				const years = now.getFullYear().toString();
				const months = (now.getMonth() + 1).toString().padStart(2, '0');
				const days = now.getDate().toString().padStart(2, '0');
				text.write(`${years}/${months}/${days}`);
			}, 1000);
		}

		const spheres = [] as BABYLON.Mesh[];

		for (let i = 0; i < 16; i++) {
			const sphereRoot = new BABYLON.TransformNode('', this.engine.scene);
			sphereRoot.position = new BABYLON.Vector3(cm(0), cm(1000 + (100 * i)), cm(0));
			const rotation = Math.random() * Math.PI * 2;
			const sphere = BABYLON.MeshBuilder.CreateSphere('', { diameter: cm(randomRange(50, 300)), segments: 16 }, this.engine.scene);
			sphere.parent = sphereRoot;
			sphere.position = new BABYLON.Vector3(cm(0), cm(0), cm(randomRange(2000, 7000)));
			spheres.push(sphere);

			const mat = new BABYLON.PBRMaterial('', this.engine.scene);
			const color = tinycolor({ h: Math.random() * 360, s: 1, l: 0.5 }).toRgb();
			mat.emissiveColor = new BABYLON.Color3(color.r / 255, color.g / 255, color.b / 255);
			mat.disableLighting = true;
			this.engine.gl?.addExcludedMesh(sphere);
			sphere.material = mat;

			const speed = randomRange(5000, 30000);
			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: rotation },
				{ frame: speed, value: Math.random() < 0.5 ? rotation + (Math.PI * 2) : rotation - (Math.PI * 2) },
			]);
			sphereRoot.animations = [anim];
			this.engine.scene.beginAnimation(sphereRoot, 0, speed, true);
		}

		for (let i = 0; i < 64; i++) {
			const sphereRoot = new BABYLON.TransformNode('', this.engine.scene);
			sphereRoot.position = new BABYLON.Vector3(cm(0), cm(randomRange(-5000, 5000)), cm(0));
			const rotation = Math.random() * Math.PI * 2;
			const sphere = BABYLON.MeshBuilder.CreateSphere('', { diameter: cm(randomRange(500, 3000)), segments: 16 }, this.engine.scene);
			sphere.parent = sphereRoot;
			sphere.position = new BABYLON.Vector3(cm(0), cm(0), cm(randomRange(10000, 15000)));
			spheres.push(sphere);

			const mat = new BABYLON.PBRMaterial('', this.engine.scene);
			const color = tinycolor({ h: Math.random() * 360, s: randomRange(0, 1), l: randomRange(0.75, 1) }).toRgb();
			mat.emissiveColor = new BABYLON.Color3(color.r / 255, color.g / 255, color.b / 255);
			mat.disableLighting = true;
			this.engine.gl?.addExcludedMesh(sphere);
			sphere.material = mat;

			const speed = randomRange(10000, 100000);
			const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
			anim.setKeys([
				{ frame: 0, value: rotation },
				{ frame: speed, value: Math.random() < 0.5 ? rotation + (Math.PI * 2) : rotation - (Math.PI * 2) },
			]);
			sphereRoot.animations = [anim];
			this.engine.scene.beginAnimation(sphereRoot, 0, speed, true);
		}

		this.engine.scene.onAfterAnimationsObservable.add(() => {
			this.engine.sr.updateMesh(spheres, false);
		});

		const adsCountCol = 4;
		const adsCountRow = 2;
		const adRoots = [] as BABYLON.TransformNode[];
		for (let j = 0; j < adsCountRow; j++) {
			for (let i = 0; i < adsCountCol; i++) {
				const adRoot = new BABYLON.TransformNode(`ad_${j}_${i}_root`, this.engine.scene);
				adRoot.position = new BABYLON.Vector3(cm(0), cm(500 + (1000 * j)), cm(0));
				const rotation = (i / adsCountCol) * Math.PI * 2;
				const adMesh = BABYLON.MeshBuilder.CreatePlane(`ad_${j}_${i}`, { width: cm(1000), height: cm(700) }, this.engine.scene);
				adMesh.parent = adRoot;
				adMesh.position = new BABYLON.Vector3(cm(0), cm(0), cm(7500));

				const tex = new BABYLON.Texture('http://syu-win.local:3000/files/e67bd2ec-a217-4c17-a222-596dcdbd0e57', this.engine.scene);
				const adMat = new BABYLON.StandardMaterial(`ad_${j}_${i}_mat`, this.engine.scene);
				adMat.emissiveTexture = tex;
				adMat.disableLighting = true;
				adMesh.material = adMat;

				const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
				anim.setKeys([
					{ frame: 0, value: rotation },
					{ frame: 15000, value: j % 2 === 0 ? rotation + (Math.PI * 2) : rotation - (Math.PI * 2) },
				]);
				adRoot.animations = [anim];
				this.engine.scene.beginAnimation(adRoot, 0, 15000, true);

				adRoots.push(adRoot);
			}
		}

		this.engine.scene.onAfterAnimationsObservable.add(() => {
			this.engine.sr.updateMesh(adRoots.flatMap(adRoot => [...adRoot.getChildMeshes()]), false);
		});

		const worldRingH = this.meshes.find(m => m.name.includes('__WORLD_RING_H__'));
		const worldRingM = this.meshes.find(m => m.name.includes('__WORLD_RING_M__'));

		worldRingH.material.reflectionTexture = null;
		worldRingM.material.reflectionTexture = null;

		worldRingH.rotation = worldRingH.rotationQuaternion.toEulerAngles();
		worldRingM.rotation = worldRingM.rotationQuaternion.toEulerAngles();
		worldRingH.rotationQuaternion = null;
		worldRingM.rotationQuaternion = null;

		const _1h = 1000 * 60 * 60;
		const _12h = _1h * 12;
		const _7days = _1h * 24 * 7;
		const _30days = _1h * 24 * 30;

		this.timer.setInterval(() => {
			const time = Date.now();
			worldRingH.rotation.x = ((time % _12h) / _12h) * Math.PI * 2;
			worldRingM.rotation.y = -(((time % _1h) / _1h) * Math.PI);
			this.engine.sr.updateMesh([worldRingH, ...worldRingH.getChildMeshes(), worldRingM, ...worldRingM.getChildMeshes()], false);
		}, 100);

		const dome = this.meshes.find(m => m.name.includes('__DOME__'));
		dome.infiniteDistance = true;
		const domeTexture = new BABYLON.CustomProceduralTexture('texture', '/client-assets/world/envs/lobby/shaders/bg', 4096, this.engine.scene);
		domeTexture.hasAlpha = true;
		domeTexture.wrapU = BABYLON.Texture.MIRROR_ADDRESSMODE;
		domeTexture.wrapV = BABYLON.Texture.MIRROR_ADDRESSMODE;
		dome.material = new BABYLON.StandardMaterial('sphereMat', this.engine.scene);
		(dome.material as BABYLON.StandardMaterial).diffuseTexture = domeTexture;
		(dome.material as BABYLON.StandardMaterial).emissiveColor = new BABYLON.Color3(1, 1, 1);
		(dome.material as BABYLON.StandardMaterial).disableLighting = true;
		(dome.material as BABYLON.StandardMaterial).useAlphaFromDiffuseTexture = true;
		//this.engine.gl!.addExcludedMesh(dome);

		const screenMeshes = this.meshes.filter(m => m.name.includes('__SCREEN__'));
		const screenMaterial = screenMeshes[0].material as BABYLON.PBRMaterial;

		const videoEl = document.createElement('video');
		videoEl.crossOrigin = 'anonymous';
		//videoEl.src = 'http://syu-win.local:3000/files/931c02c3-6238-4c29-9371-06bab78950bb';

		const hls = new Hls();
		hls.loadSource('https://tvs.misskey.io/official/hq-beta/ts:abr.m3u8');
		hls.attachMedia(videoEl);

		this.timer.setTimeout(() => {
			const tex = new BABYLON.VideoTexture('', videoEl, this.engine.scene, true, true);
			tex.level = 0.5;
			tex.video.loop = true;
			tex.video.volume = 0.25;
			tex.video.muted = true;
			screenMaterial.albedoColor = new BABYLON.Color3(0, 0, 0);
			screenMaterial.emissiveTexture = tex;
			screenMaterial.emissiveColor = new BABYLON.Color3(1, 1, 1);
			tex.onLoadObservable.addOnce(() => {
				tex.video.play();
				for (const mesh of screenMeshes) {
					if (mesh instanceof BABYLON.InstancedMesh) continue;
					//normalizeUvToSquare(mesh);
					const updateUv = createPlaneUvMapper(mesh);
					if (tex == null) return;
					const srcAspect = tex.getSize().width / tex.getSize().height;
					const targetAspect = 16 / 9;
					updateUv(srcAspect, targetAspect, 'cover', 0);
				}
			});
		}, 3000);

		const emitter = new BABYLON.TransformNode('emitter', this.engine.scene);
		emitter.position = new BABYLON.Vector3(0, cm(-1000), 0);
		const ps = new BABYLON.ParticleSystem('', 128, this.engine.scene);
		ps.particleTexture = new BABYLON.Texture('/client-assets/world/envs/lobby/bubble.png');
		ps.emitter = emitter;
		ps.isLocal = true;
		ps.minEmitBox = new BABYLON.Vector3(cm(-1000), 0, cm(-1000));
		ps.maxEmitBox = new BABYLON.Vector3(cm(1000), 0, cm(1000));
		ps.minEmitPower = cm(100);
		ps.maxEmitPower = cm(500);
		ps.minLifeTime = 30;
		ps.maxLifeTime = 30;
		ps.minSize = cm(30);
		ps.maxSize = cm(300);
		ps.direction1 = new BABYLON.Vector3(0, 1, 0);
		ps.direction2 = new BABYLON.Vector3(0, 1, 0);
		ps.emitRate = 1.5;
		ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
		ps.color1 = new BABYLON.Color4(1, 1, 1, 0.3);
		ps.color2 = new BABYLON.Color4(1, 1, 1, 0.2);
		ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
		ps.preWarmCycles = Math.random() * 1000;
		ps.start();

		this.engine.sr.fixParticleSystem(ps);

		this.registerMeshes(this.meshes);
	}

	public setTime(time: number) {
		if (this.skyboxMat == null) return;

		if (time === 0) {
			this.skyboxMat.emissiveColor = new BABYLON.Color3(0.7, 0.9, 1.0);
		} else if (time === 1) {
			this.skyboxMat.emissiveColor = new BABYLON.Color3(0.8, 0.5, 0.3);
		} else {
			this.skyboxMat.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.2);
		}

		if (this.sunLight != null) {
			this.sunLight.diffuse = time === 0 ? new BABYLON.Color3(1.0, 0.9, 0.8) : time === 1 ? new BABYLON.Color3(1.0, 0.8, 0.6) : new BABYLON.Color3(0.6, 0.8, 1.0);
			this.sunLight.intensity = time === 0 ? 3 : time === 1 ? 1 : 0.25;
		}
	}

	public dispose() {
		this.timer.dispose();
		for (const m of this.meshes) {
			m.dispose(false, true);
		}
		this.skybox?.dispose();
		this.skyboxMat?.dispose();
		this.envMapIndoor?.dispose();
		this.sunLight?.dispose();
		if (this.loaderResult != null) {
			for (const m of this.loaderResult.meshes) {
				m.dispose(false, true);
			}
			for (const t of this.loaderResult.transformNodes) {
				t.dispose(false, true);
			}
		}
		super.dispose();
	}
}

class MessageRing {
	constructor(mesh: BABYLON.Mesh, scene: BABYLON.Scene, options: { material: BABYLON.StandardMaterial; repeatSeparator: string; }) {
		const messageRingRoot = new BABYLON.TransformNode('', this.engine.scene);
		const messageRing = this.meshes.find(m => m.name.includes('__MESSAGE_RING_INNER_1__'));
		messageRing.parent = messageRingRoot;
		messageRing.rotation = messageRing.rotationQuaternion.toEulerAngles();
		messageRing.rotationQuaternion = null;
		const text = new RecyvlingTextGrid(messageRing, 64, {
			material: this.textMaterial,
			repeatSeparator: '  ',
		});

		//messageRingRoot.rotation.x = Math.PI / 4;

		const anim = new BABYLON.Animation('', 'rotation.y', 60, BABYLON.Animation.ANIMATIONTYPE_FLOAT, BABYLON.Animation.ANIMATIONLOOPMODE_CYCLE);
		anim.setKeys([
			{ frame: 0, value: 0 },
			{ frame: 10000, value: (Math.PI * 2) },
		]);
		messageRing.animations = [anim];
		this.engine.scene.beginAnimation(messageRing, 0, 10000, true);

		this.timer.setInterval(() => {
			const now = new Date();
			const hours = now.getHours().toString().padStart(2, '0');
			const minutes = now.getMinutes().toString().padStart(2, '0');
			const seconds = now.getSeconds().toString().padStart(2, '0');
			text.write(`${hours}:${minutes}:${seconds}`);
		}, 1000);
	}
}
