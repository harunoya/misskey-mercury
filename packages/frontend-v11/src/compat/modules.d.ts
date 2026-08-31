/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

declare module 'prismjs' {
	const Prism: {
		languages: Record<string, unknown>;
		highlight(source: string, grammar: unknown, language: string): string;
	};
	export default Prism;
}

declare module 'vue-i18n/dist/vue-i18n.esm-bundler.js' {
	export * from 'vue-i18n';
}

declare module 'vue/dist/vue.esm-bundler.js' {
	export * from 'vue';
}

interface Window {
	lang?: string;
}
