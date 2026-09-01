<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root"></div>
</template>

<script lang="ts" setup>
import { onMounted } from 'vue';
import { miLocalStorage } from '@/local-storage.js';

/**
 * The vendored Misskey v11 client, as one of the UI styles.
 *
 * Like `deck` and `zen` this is a value of the `ui` preference, chosen from the same menu and
 * applied by reloading the page you are already on — the URL never changes, and there is no second
 * address to visit. What is different is that v11 is a separate build with its own Vue app, so
 * instead of rendering a tree here this component loads that bundle and lets it mount alongside.
 */

/** Where the v11 build publishes its assets. Matches `publicPath` in its webpack config. */
const V11_BOOT_SCRIPT = '/v11/assets/v11-boot.js';

function loadV11(): void {
	// `loader/boot.js` arms these to show "Failed to initialize Misskey", and `common()` clears
	// them once the app mounts. Mounting this component is that moment, but v11 boots afterwards
	// and its own errors would otherwise trip the screen. v11 carries its own recovery control.
	window.onerror = null;
	window.onunhandledrejection = null;

	const script = window.document.createElement('script');
	script.src = V11_BOOT_SCRIPT;
	script.addEventListener('error', () => {
		// Without the bundle there is nothing to look at, so put back the UI they came from — the
		// same write-and-reload the menu does, leaving the URL alone.
		console.error(`[mercury] failed to load ${V11_BOOT_SCRIPT}`);
		miLocalStorage.setItem('ui', miLocalStorage.getItem('mercury:v11:previousUi') ?? 'default');
		window.location.reload();
	});
	window.document.head.appendChild(script);
}

onMounted(loadV11);
</script>

<style lang="scss" module>
.root {
	// v11 mounts into its own element and paints the whole page itself; this one only exists
	// because the current UI needs a root component to mount.
	display: none;
}
</style>
