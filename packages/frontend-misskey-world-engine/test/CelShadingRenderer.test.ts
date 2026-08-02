/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as BABYLON from '@babylonjs/core';
import { CelShadingRenderer } from '../src/CelShadingRenderer.js';

test('replays opaque meshes after their color pass and before transparent meshes', async () => {
	const engine = new BABYLON.NullEngine();
	const scene = new BABYLON.Scene(engine);
	const camera = new BABYLON.FreeCamera('camera', new BABYLON.Vector3(0, 0, -10), scene);
	camera.setTarget(BABYLON.Vector3.Zero());
	scene.activeCamera = camera;

	const opaque = BABYLON.MeshBuilder.CreateBox('opaque', {}, scene);
	opaque.material = new BABYLON.StandardMaterial('opaqueMaterial', scene);
	const transparent = BABYLON.MeshBuilder.CreateBox('transparent', {}, scene);
	const transparentMaterial = new BABYLON.StandardMaterial('transparentMaterial', scene);
	transparentMaterial.alpha = 0.5;
	transparent.material = transparentMaterial;

	const events: string[] = [];
	opaque.onAfterRenderObservable.add(() => events.push('opaque'));
	transparent.onAfterRenderObservable.add(() => events.push('transparent'));

	const renderer = new CelShadingRenderer(scene, {
		outlineRenderer: {
			enabled: true,
			zOffset: 1,
			zOffsetUnits: 4,
			render(subMesh: BABYLON.SubMesh) {
				events.push(`outline:${subMesh.getRenderingMesh().name}`);
			},
		},
	});

	try {
		await scene.whenReadyAsync();
		scene.render();

		expect(events).toEqual(['opaque', 'outline:opaque', 'transparent']);
	} finally {
		renderer.dispose();
		scene.dispose();
		engine.dispose();
	}
});
