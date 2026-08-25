/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

module.exports = function legacyTransform(source) {
	if (this.resourcePath.endsWith('.vue')) {
		return source
			.replace(/(["'`(])\/assets\//g, '$1/v11/assets/')
			.replaceAll('${url}/assets/', '${url}/v11/assets/')
			.replace('../../../../../../node_modules/katex/dist/katex.min.css', 'katex/dist/katex.min.css')
			.replace(/(\t\tonBgClick\(\) \{\r?\n\t\t\tif \(this\.cancelableByBgClick\) this\.cancel\(\);\r?\n\t\t})\r?\n(\r?\n\t\tclose\(\))/, '$1,$2')
			.replace(/(\r?\n\t})\r?\n(\tmethods:)/, '$1,$2')
			.replace(/\}\)\)(\r?\n\s+default:)/g, '})),$1');
	}
	if (/[\\/]app[\\/](?:desktop|mobile)[\\/]script\.ts$/.test(this.resourcePath)) {
		return source.replace(/\}, true\);\s*$/, '}, false);');
	}
	// The current backend authenticates /streaming from `?i=<token>` exactly like v11 did
	// (StreamingApiServerService reads `q.get('i')`), so upstream's URL is kept as-is.
	return source;
};
