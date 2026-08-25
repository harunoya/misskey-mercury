/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import webpack from 'webpack';
import vueLoader from 'vue-loader/lib/plugin.js';

const require = createRequire(import.meta.url);
const packageRoot = dirname(fileURLToPath(import.meta.url));
const vendorRoot = resolve(packageRoot, 'vendor/misskey-11.37.1');
const yaml = require('js-yaml');
const localeJa = yaml.safeLoad(readFileSync(resolve(vendorRoot, 'locales/ja-JP.yml'), 'utf8'));
const constants = require(resolve(vendorRoot, 'src/const.json'));
const VueLoaderPlugin = vueLoader;

// Absolute urls point at runtime-served assets (`/v11/assets/…`), not files webpack should resolve.
const cssUrl = { filter: (url) => !url.startsWith('/') };
const cssModules = { localIdentName: '[name]_[local]_[hash:base64:5]' };

export default {
	entry: resolve(packageRoot, 'src/boot.ts'),
	output: {
		path: resolve(packageRoot, '../../built/_frontend_v11_'),
		filename: 'assets/[name].[contenthash:8].js',
		chunkFilename: 'assets/[name].[contenthash:8].js',
		publicPath: '/v11/',
		clean: true,
	},
	module: {
		rules: [
			{ test: /[\\/]vendor[\\/]misskey-11\.37\.1[\\/]src[\\/]client[\\/].*\.(?:ts|js|vue)$/, enforce: 'pre', use: resolve(packageRoot, 'scripts/legacy-transform-loader.cjs') },
			{ test: /\.vue$/, use: ['vue-loader', 'vue-svg-inline-loader'] },
			{ test: /\.ts$/, use: { loader: 'ts-loader', options: { transpileOnly: true, configFile: resolve(vendorRoot, 'src/client/app/tsconfig.json'), appendTsSuffixTo: [/\.vue$/] } } },
			// BUILD_COMPAT: 17 v11 components use `<style module>` and reference `$style.*`.
			// vue-loader tags those blocks with a `module` resourceQuery but leaves it to css-loader
			// to actually enable CSS Modules. Without the `oneOf` split below their class names stay
			// global — `.avatar`/`.name`/`.banner` from the profile widget then leak onto every note
			// in the timeline — and `$style` resolves to an empty object in those components.
			{
				test: /\.styl(?:us)?$/,
				oneOf: [
					{ resourceQuery: /module/, use: ['vue-style-loader', { loader: 'css-loader', options: { url: cssUrl, modules: cssModules } }, 'stylus-loader'] },
					{ use: ['vue-style-loader', { loader: 'css-loader', options: { url: cssUrl } }, 'stylus-loader'] },
				],
			},
			{
				test: /\.css$/,
				oneOf: [
					{ resourceQuery: /module/, use: ['vue-style-loader', { loader: 'css-loader', options: { url: cssUrl, modules: cssModules } }] },
					{ use: ['vue-style-loader', { loader: 'css-loader', options: { url: cssUrl } }] },
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
			'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
		}),
		new HtmlWebpackPlugin({ template: resolve(packageRoot, 'index.html') }),
	],
	resolve: {
		extensions: ['.js', '.ts', '.json', '.vue'],
		extensionAlias: { '.js': ['.ts', '.js'] },
		alias: {
			'const.styl': resolve(vendorRoot, 'src/client/const.styl'),
			vue$: 'vue/dist/vue.esm.js',
		},
		fallback: { crypto: false, querystring: require.resolve('querystring-es3') },
	},
	devServer: {
		port: Number(process.env.FRONTEND_V11_VITE_PORT ?? 5175),
		historyApiFallback: { index: '/v11/' },
		proxy: [{ context: ['/api', '/streaming', '/files'], target: process.env.FRONTEND_V11_BACKEND ?? 'http://127.0.0.1:3000', ws: true }],
	},
	performance: { hints: false },
};
