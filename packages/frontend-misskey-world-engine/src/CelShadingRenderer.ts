/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as BABYLON from '@babylonjs/core/pure.js';

type InstancesBatch = Parameters<BABYLON.OutlineRenderer['render']>[1];

export type CelShadingOutlineRenderer = Pick<BABYLON.OutlineRenderer, 'enabled' | 'zOffset' | 'zOffsetUnits' | 'render'>;

export type CelShadingRendererOptions = {
	outlineRenderer: CelShadingOutlineRenderer;
};

type QueuedSubMesh = {
	mesh: BABYLON.Mesh;
	subMesh: BABYLON.SubMesh;
	batch: InstancesBatch;
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
	private readonly renderingGroupHooks = new Map<number, RenderingGroupHook>();
	private readonly queuedSubMeshes: QueuedSubMesh[] = [];
	private readonly queuedSubMeshSet = new Set<BABYLON.SubMesh>();
	private currentRenderingGroupId: number | null = null;
	private disposed = false;

	private readonly beforeRenderingGroupObserver: BABYLON.Observer<BABYLON.RenderingGroupInfo>;
	private readonly afterRenderingGroupObserver: BABYLON.Observer<BABYLON.RenderingGroupInfo>;

	public constructor(scene: BABYLON.Scene, options: CelShadingRendererOptions) {
		this.scene = scene;
		this.outlineRenderer = options.outlineRenderer;

		this.register();
		this.beforeRenderingGroupObserver = this.scene.onBeforeRenderingGroupObservable.add(this.onBeforeRenderingGroup);
		this.afterRenderingGroupObserver = this.scene.onAfterRenderingGroupObservable.add(this.onAfterRenderingGroup);
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

	private collectSubMesh(mesh: BABYLON.Mesh, subMesh: BABYLON.SubMesh, batch: InstancesBatch): void {
		if (this.currentRenderingGroupId === null) return;
		if (!this.isMainRenderPass()) return;
		if (mesh.renderingGroupId !== this.currentRenderingGroupId) return;

		const material = subMesh.getMaterial();
		if (material == null || material.needAlphaBlendingForMesh(mesh)) return;
		if (this.queuedSubMeshSet.has(subMesh)) return;

		this.queuedSubMeshSet.add(subMesh);
		this.queuedSubMeshes.push({ mesh, subMesh, batch });
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
			this.outlineRenderer.render(entry.subMesh, entry.batch, false);
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
