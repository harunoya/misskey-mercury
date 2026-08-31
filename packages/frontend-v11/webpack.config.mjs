/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';
import { VueLoaderPlugin } from 'vue-loader';

const require = createRequire(import.meta.url);
const packageRoot = dirname(fileURLToPath(import.meta.url));
const vendorRoot = resolve(packageRoot, 'vendor/misskey-11.37.1');
const yaml = require('js-yaml');
const localeJa = yaml.safeLoad(readFileSync(resolve(vendorRoot, 'locales/ja-JP.yml'), 'utf8'));
const constants = require(resolve(vendorRoot, 'src/const.json'));

// Absolute urls point at runtime-served assets (`/v11/assets/…`), not files webpack should resolve.
const cssUrl = { filter: (url) => !url.startsWith('/') };
// `namedExport` defaults to true in css-loader 7, which removes the default export the locals map
// used to live on — vue-loader imports exactly that to populate `$style`, so leaving the default on
// makes `$style` undefined in all 17 components that use `<style module>`. `as-is` keeps the class
// names as authored; the camelCase conversion that comes with named exports would rename them.
const cssModules = {
	localIdentName: '[name]_[local]_[hash:base64:5]',
	namedExport: false,
	exportLocalsConvention: 'as-is',
};

export default {
	entry: { 'v11-boot': resolve(packageRoot, 'src/boot.ts') },
	output: {
		path: resolve(packageRoot, '../../built/_frontend_v11_'),
		// The entry keeps a stable name because the current UI loads it by URL when handing over,
		// and it is served `no-cache` for that reason. Everything it pulls in stays content-hashed
		// and immutable, so only this one small file is re-fetched per visit.
		filename: 'assets/[name].js',
		chunkFilename: 'assets/[name].[contenthash:8].js',
		publicPath: '/v11/',
		clean: true,
	},
	module: {
		rules: [
			// Covers all of `src`, not just `src/client`: the MFM parser under `src/mfm` also needs a
			// compatibility patch, and it is shared with the server-side code v11 built from here.
			{ test: /[\\/]vendor[\\/]misskey-11\.37\.1[\\/]src[\\/].*\.(?:ts|js|vue)$/, enforce: 'pre', use: resolve(packageRoot, 'scripts/legacy-transform-loader.cjs') },
			// `vue-svg-inline-loader` runs first (webpack applies `use` right to left): it inlines
			// `<img svg-inline>` so the surrounding `> svg` rules can size and fill the icon.
			{
				test: /\.vue$/,
				use: [
					// Vue 3's compiler defaults to `whitespace: 'condense'`, which deletes a
					// whitespace-only text node between two tags when it contains a newline. Vue 2
					// kept it as a single space, and v11's markup relies on that: `@user @host` and
					// the reaction's `👍 1` are adjacent elements separated only by the source
					// indentation, and ran together without it.
					{ loader: 'vue-loader', options: { compilerOptions: { whitespace: 'preserve' } } },
					'vue-svg-inline-loader',
				],
			},
			{ test: /\.ts$/, use: { loader: 'ts-loader', options: { transpileOnly: true, configFile: resolve(vendorRoot, 'src/client/app/tsconfig.json'), appendTsSuffixTo: [/\.vue$/] } } },
			// BUILD_COMPAT: 17 v11 components use `<style module>` and reference `$style.*`.
			// vue-loader tags those blocks with a `module` resourceQuery but leaves it to css-loader
			// to actually enable CSS Modules. Without the `oneOf` split below their class names stay
			// global — `.avatar`/`.name`/`.banner` from the profile widget then leak onto every note
			// in the timeline — and `$style` resolves to an empty object in those components.
			{
				test: /\.styl(?:us)?$/,
				oneOf: [
					{ resourceQuery: /module/, use: ['style-loader', { loader: 'css-loader', options: { url: cssUrl, modules: cssModules } }, 'stylus-loader'] },
					{ use: ['style-loader', { loader: 'css-loader', options: { url: cssUrl } }, 'stylus-loader'] },
				],
			},
			{
				test: /\.css$/,
				oneOf: [
					{ resourceQuery: /module/, use: ['style-loader', { loader: 'css-loader', options: { url: cssUrl, modules: cssModules } }] },
					{ use: ['style-loader', { loader: 'css-loader', options: { url: cssUrl } }] },
				],
			},
			// BUILD_COMPAT: v11 loads themes with CommonJS `require()`. json5-loader defaults to
			// `export default`, which webpack hands back as `{ default: … }` and breaks theme.ts.
			{ test: /\.json5$/, type: 'javascript/auto', use: { loader: 'json5-loader', options: { esModule: false } } },
			{ test: /\.(?:png|jpe?g|gif|svg|woff2?|eot|ttf)$/i, type: 'asset' },
		],
	},
	plugins: [
		new VueLoaderPlugin(),
		new CopyWebpackPlugin({ patterns: [{ from: resolve(vendorRoot, 'src/client/assets'), to: 'assets' }] }),
		new webpack.DefinePlugin({
			_COPYRIGHT_: JSON.stringify(constants.copyright),
			_VERSION_: JSON.stringify('11.37.1-mercury'),
			_CODENAME_: JSON.stringify('daybreak'),
			// BUILD_COMPAT: upstream emits [code, displayName] pairs; settings/language.vue reads x[0]/x[1].
			_LANGS_: JSON.stringify([['ja-JP', localeJa?.meta?.lang ?? '日本語']]),
			_ENV_: JSON.stringify(process.env.NODE_ENV ?? 'production'),
			_V11_LOCALE_: JSON.stringify(localeJa),
			// `process.env.NODE_ENV` is deliberately not defined here: webpack already defines it
			// from `mode`, and defining it again pinned Vue to its production runtime even in a
			// development build, which silently suppressed every Vue warning.

			// Vue 3 asks bundlers to state these so it can tree-shake; unset triggers a runtime warning.
			__VUE_OPTIONS_API__: 'true',
			__VUE_PROD_DEVTOOLS__: 'false',
			__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
		}),
		// No HTML entry: v11 no longer has a page of its own. The current UI serves the
		// document at every path and loads `assets/v11-boot.js` into it when the reader
		// prefers v11, so both clients share one URL space.
	],
	resolve: {
		extensions: ['.js', '.ts', '.json', '.vue'],
		extensionAlias: { '.js': ['.ts', '.js'] },
		alias: {
			'const.styl': resolve(vendorRoot, 'src/client/const.styl'),
			// Vue 2 packages with no Vue 3 release. Aliasing keeps the vendored import statements
			// untouched, so the diff against upstream stays about Vue 3 rather than about plumbing.
			'vue-prism-component': resolve(packageRoot, 'src/compat/shim-prism.ts'),
			'vue-content-loading': resolve(packageRoot, 'src/compat/shim-content-loading.ts'),
			'vue-sequential-entrance': resolve(packageRoot, 'src/compat/shim-sequential-entrance.ts'),
			'v-animate-css': resolve(packageRoot, 'src/compat/shim-animate-css.ts'),
			'v-debounce': resolve(packageRoot, 'src/compat/shim-debounce.ts'),
			'vue-js-modal': resolve(packageRoot, 'src/compat/shim-modal.ts'),
			'vue-marquee-text-component': resolve(packageRoot, 'src/compat/shim-marquee.ts'),
			// The shim re-exports the real Vue and adds back the Vue 2 global API that v11's
			// bootstrap calls before an app instance exists.
			vue$: resolve(packageRoot, 'src/compat/vue-global.ts'),
			'vue-router$': resolve(packageRoot, 'src/compat/shim-router.ts'),
			'vue-i18n$': resolve(packageRoot, 'src/compat/shim-i18n.ts'),
			// Lets vendored files reach the compat layer without counting `../` up to the package root.
			'@compat': resolve(packageRoot, 'src/compat'),
		},
		fallback: { crypto: false, querystring: require.resolve('querystring-es3') },
	},
	devServer: {
		port: Number(process.env.FRONTEND_V11_VITE_PORT ?? 5175),
		proxy: [{ context: ['/api', '/streaming', '/files'], target: process.env.FRONTEND_V11_BACKEND ?? 'http://127.0.0.1:3000', ws: true }],
	},
	performance: { hints: false },
};
