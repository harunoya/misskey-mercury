/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as BABYLON from '@babylonjs/core/pure.js';

type InstancesBatch = Parameters<BABYLON.OutlineRenderer['render']>[1];

const TRIANGLE_FILL_MODES = new Set<number>([
	BABYLON.Material.TriangleFillMode,
	BABYLON.Material.TriangleStripDrawMode,
	BABYLON.Material.TriangleFanDrawMode,
]);

export type CelShadingOutlineRenderer = Pick<BABYLON.OutlineRenderer, 'enabled' | 'zOffset' | 'zOffsetUnits' | 'render'>;

export type CelShadingOptions = {
	enabled: boolean;
	color: BABYLON.Color3;
	width: number;
};

export type CelShadingRendererDependencies = {
	outlineRenderer: CelShadingOutlineRenderer;
};

type QueuedSubMesh = {
	mesh: BABYLON.Mesh;
	subMesh: BABYLON.SubMesh;
	batch: InstancesBatch;
	options: CelShadingOptions;
};

type RenderingGroupHook = {
	group: BABYLON.RenderingGroup;
	previous: (() => void) | undefined;
	callback: () => void;
};

export class CelShadingRenderer implements BABYLON.ISceneComponent {
	public readonly name = 'CelShadingRenderer';
	public readonly scene: BABYLON.Scene;

	private readonly outlineRenderer: CelShadingOutlineRenderer;
	private readonly defaultOptions: CelShadingOptions;
	private readonly meshOptions = new WeakMap<BABYLON.Mesh, Partial<CelShadingOptions>>();
	private readonly renderingGroupHooks = new Map<number, RenderingGroupHook>();
	private readonly queuedSubMeshes: QueuedSubMesh[] = [];
	private readonly queuedSubMeshSet = new Set<BABYLON.SubMesh>();
	private currentRenderingGroupId: number | null = null;
	private disposed = false;

	private readonly beforeRenderingGroupObserver: BABYLON.Observer<BABYLON.RenderingGroupInfo>;
	private readonly afterRenderingGroupObserver: BABYLON.Observer<BABYLON.RenderingGroupInfo>;
	private readonly beforeParticlesRenderingObserver: BABYLON.Observer<BABYLON.Scene>;

	public constructor(scene: BABYLON.Scene, options: CelShadingOptions, dependencies: CelShadingRendererDependencies) {
		this.scene = scene;
		this.defaultOptions = {
			enabled: options.enabled,
			color: options.color.clone(),
			width: options.width,
		};
		this.outlineRenderer = dependencies.outlineRenderer;

		this.register();
		this.beforeRenderingGroupObserver = this.scene.onBeforeRenderingGroupObservable.add(this.onBeforeRenderingGroup);
		this.afterRenderingGroupObserver = this.scene.onAfterRenderingGroupObservable.add(this.onAfterRenderingGroup);
		this.beforeParticlesRenderingObserver = this.scene.onBeforeParticlesRenderingObservable.add(this.onBeforeParticlesRendering);
	}

	public setMeshOptions(mesh: BABYLON.Mesh, options: Partial<CelShadingOptions>): void {
		this.meshOptions.set(mesh, {
			...this.meshOptions.get(mesh),
			...options,
		});
	}

	public clearMeshOptions(mesh: BABYLON.Mesh): void {
		this.meshOptions.delete(mesh);
	}

	public excludeMesh(mesh: BABYLON.Mesh): void {
		this.setMeshOptions(mesh, { enabled: false });
	}

	public includeMesh(mesh: BABYLON.Mesh): void {
		this.setMeshOptions(mesh, { enabled: true });
	}

	public register(): void {
		this.scene._afterRenderingMeshStage.registerStep(0, this, this.collectSubMesh);
	}

	public rebuild(): void {
	}

	public dispose(): void {
		if (this.disposed) return;
		this.disposed = true;

		this.scene.onBeforeRenderingGroupObservable.remove(this.beforeRenderingGroupObserver);
		this.scene.onAfterRenderingGroupObservable.remove(this.afterRenderingGroupObserver);
		this.scene.onBeforeParticlesRenderingObservable.remove(this.beforeParticlesRenderingObserver);
		this.removeStageSteps();

		for (const hook of this.renderingGroupHooks.values()) {
			if (hook.group.onBeforeTransparentRendering === hook.callback) {
				hook.group.onBeforeTransparentRendering = hook.previous!;
			}
		}
		this.renderingGroupHooks.clear();
		this.clearQueue();
	}

	private readonly onBeforeRenderingGroup = (info: BABYLON.RenderingGroupInfo): void => {
		this.currentRenderingGroupId = info.renderingGroupId;
		this.clearQueue();
		this.installRenderingGroupHook(info.renderingGroupId, info.renderingManager.getRenderingGroup(info.renderingGroupId));
	};

	private readonly onAfterRenderingGroup = (): void => {
		this.clearQueue();
		this.currentRenderingGroupId = null;
	};

	private readonly onBeforeParticlesRendering = (): void => {
		if (this.currentRenderingGroupId !== null) this.flush(this.currentRenderingGroupId);
	};

	private collectSubMesh(mesh: BABYLON.Mesh, subMesh: BABYLON.SubMesh, batch: InstancesBatch): void {
		if (this.currentRenderingGroupId === null) return;
		if (!this.isMainRenderPass()) return;
		if (mesh.renderingGroupId !== this.currentRenderingGroupId) return;

		const material = subMesh.getMaterial();
		if (material == null || material.needAlphaBlendingForMesh(mesh)) return;
		if (!TRIANGLE_FILL_MODES.has(material.fillMode)) return;
		if (!mesh.isVerticesDataPresent(BABYLON.VertexBuffer.NormalKind)) return;
		const options = this.resolveMeshOptions(mesh);
		if (!options.enabled || !Number.isFinite(options.width) || options.width <= 0) return;
		if (this.queuedSubMeshSet.has(subMesh)) return;

		this.queuedSubMeshSet.add(subMesh);
		this.queuedSubMeshes.push({ mesh, subMesh, batch, options });
	}

	private resolveMeshOptions(mesh: BABYLON.Mesh): CelShadingOptions {
		return {
			...this.defaultOptions,
			...this.meshOptions.get(mesh),
		};
	}

	private isMainRenderPass(): boolean {
		const camera = this.scene.activeCamera;
		const mainRenderPassId = camera?.outputRenderTarget?.renderPassId ?? camera?.renderPassId ?? BABYLON.Constants.RENDERPASS_MAIN;
		return this.scene.getEngine().currentRenderPassId === mainRenderPassId;
	}

	private installRenderingGroupHook(renderingGroupId: number, group: BABYLON.RenderingGroup): void {
		const currentHook = this.renderingGroupHooks.get(renderingGroupId);
		if (currentHook?.group === group && group.onBeforeTransparentRendering === currentHook.callback) return;

		const previous = group.onBeforeTransparentRendering;
		const callback = (): void => {
			previous?.();
			this.flush(renderingGroupId);
		};
		group.onBeforeTransparentRendering = callback;
		this.renderingGroupHooks.set(renderingGroupId, { group, previous, callback });
	}

	private flush(renderingGroupId: number): void {
		if (this.currentRenderingGroupId !== renderingGroupId) return;

		for (const entry of this.queuedSubMeshes) {
			const previousWidth = entry.mesh.outlineWidth;
			const previousColor = entry.mesh.outlineColor;
			try {
				entry.mesh.outlineWidth = entry.options.width;
				entry.mesh.outlineColor = entry.options.color;
				this.outlineRenderer.render(entry.subMesh, entry.batch, false);
			} finally {
				entry.mesh.outlineWidth = previousWidth;
				entry.mesh.outlineColor = previousColor;
			}
		}
		this.clearQueue();
	}

	private clearQueue(): void {
		this.queuedSubMeshes.length = 0;
		this.queuedSubMeshSet.clear();
	}

	private removeStageSteps(): void {
		const stage = this.scene._afterRenderingMeshStage;
		for (let i = stage.length - 1; i >= 0; i--) {
			if (stage[i].component === this) stage.splice(i, 1);
		}
	}
}
