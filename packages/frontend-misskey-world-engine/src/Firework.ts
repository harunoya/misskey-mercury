/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as BABYLON from '@babylonjs/core/pure.js';
import { cm, WORLD_SCALE } from 'misskey-world/src/utility.js';
import { randomRange, Timer } from './utility.js';
import type { EngineBase } from './EngineBase.js';

export class Firework {
	private engine: EngineBase<any>;
	private timer: Timer = new Timer();

	constructor(engine: EngineBase<any>) {
		this.engine = engine;
	}

	public launch(options: {
		position: [number, number, number];
	}) {
		this.engine.sr.disableSnapshotRendering();

		const texture = new BABYLON.Texture(`/client-assets/world/other/firework/flare-${Math.round(randomRange(1, 8))}.png`, this.engine.scene);

		//const emitter = new BABYLON.TransformNode('emitter', this.engine.scene);
		const emitter = BABYLON.MeshBuilder.CreateBox('emitter', { size: cm(10) }, this.engine.scene);
		emitter.position = new BABYLON.Vector3(options.position[0], options.position[1], options.position[2]);
		const ps = new BABYLON.ParticleSystem('', 128, this.engine.scene);
		ps.particleTexture = texture;
		ps.emitter = emitter;
		ps.minEmitPower = cm(100);
		ps.maxEmitPower = cm(500);
		ps.minLifeTime = 0.5;
		ps.maxLifeTime = 1;
		ps.minSize = cm(3);
		ps.maxSize = cm(30);
		//ps.direction1 = new BABYLON.Vector3(0, 1, 0);
		//ps.direction2 = new BABYLON.Vector3(0, 1, 0);
		ps.emitRate = 20;
		ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
		//ps.color1 = new BABYLON.Color4(1, 1, 1, 0.3);
		//ps.color2 = new BABYLON.Color4(1, 1, 1, 0.2);
		ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
		ps.start();

		this.engine.sr.fixParticleSystem(ps);

		const launchAnim = new BABYLON.Animation(
			'',
			'position',
			60,
			BABYLON.Animation.ANIMATIONTYPE_VECTOR3,
			BABYLON.Animation.ANIMATIONLOOPMODE_CONSTANT,
		);
		launchAnim.setKeys([
			{ frame: 0, value: new BABYLON.Vector3(options.position[0], options.position[1], options.position[2]) },
			{ frame: 60, value: new BABYLON.Vector3(options.position[0], options.position[1] + cm(randomRange(1000, 3000)), options.position[2]) },
		]);

		emitter.animations.push(launchAnim);
		const animating = Promise.withResolvers<void>();
		const animationObserver = this.engine.scene.onAfterAnimationsObservable.add(() => {
		});
		this.engine.scene.beginAnimation(emitter, 0, 60, false, 1, () => { animating.resolve(); });
		animating.promise.then(() => {
			this.engine.scene.onAfterAnimationsObservable.remove(animationObserver);

			ps.stop();

			this.timer.setTimeout(() => {
				this.engine.sr.disableSnapshotRendering();
				ps.dispose();
				emitter.dispose();
				this.engine.sr.enableSnapshotRendering();
			}, 1000);

			this.explode({
				position: [emitter.position.x, emitter.position.y, emitter.position.z],
				texture,
			});
		});

		this.engine.sr.enableSnapshotRendering();
	}

	public explode(options: {
		position: [number, number, number];
		texture: BABYLON.Texture;
	}) {
		this.engine.sr.disableSnapshotRendering();

		const ps = new BABYLON.ParticleSystem('', 128, this.engine.scene);
		ps.particleTexture = options.texture;
		ps.emitter = new BABYLON.Vector3(options.position[0], options.position[1], options.position[2]);
		ps.minEmitPower = cm(2000);
		ps.maxEmitPower = cm(4000);
		ps.minLifeTime = 0.7;
		ps.maxLifeTime = 1;
		ps.addDragGradient(0, 0.1);
		ps.addDragGradient(1, 0.8);
		ps.gravity = new BABYLON.Vector3(0, -30, 0).scale(WORLD_SCALE);
		ps.minSize = cm(20);
		ps.maxSize = cm(40);
		const sphereEmitter = ps.createSphereEmitter(cm(1));
		//ps.direction1 = new BABYLON.Vector3(0, 1, 0);
		//ps.direction2 = new BABYLON.Vector3(0, 1, 0);
		ps.manualEmitCount = 100;
		ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
		ps.color1 = new BABYLON.Color4(1, 1, 1, 1);
		ps.color2 = new BABYLON.Color4(1, 1, 1, 1);
		ps.colorDead = new BABYLON.Color4(1, 1, 1, 0);
		ps.start();

		this.engine.sr.fixParticleSystem(ps);

		this.timer.setTimeout(() => {
			this.engine.sr.disableSnapshotRendering();
			ps.dispose();
			this.engine.sr.enableSnapshotRendering();
		}, 2000);

		this.engine.sr.enableSnapshotRendering();
	}

	public dispose() {
		this.timer.dispose();
	}
}
