/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

module.exports = function legacyTransform(source) {
	if (this.resourcePath.endsWith('emoji.vue')) {
		// API_COMPAT: v11 can only draw a custom emoji it finds by exact name in the list handed to
		// it, which is how emoji worked when every one of them was local and listed in `meta`. The
		// current backend resolves `/emoji/<name>.webp` server-side instead — including the
		// `name@host` form — and never lists remote emoji at all, so falling back to that path is
		// the only way `:blobcat@remote.example:` or a `:name@.:` reaction can render. The local
		// host marker is part of the name v11 sees but not of the image path.
		source = source.replaceAll(
			'const customEmoji = this.customEmojis.find(x => x.name == this.name);',
			'const customEmoji = this.customEmojis.find(x => x.name == this.name) || { name: this.name, url: `/emoji/${this.name.replace(/@\\.$/, \'\')}.webp` };',
		);
	}
	if (/[\\/]mfm[\\/]language\.ts$/.test(this.resourcePath)) {
		// API_COMPAT: v11's emoji rule predates remote custom emoji, so `:name@host:` never becomes
		// an emoji node and survives as literal text no matter what the API returns.
		source = source.replace(
			'P.regexp(/:([a-z0-9_+-]+):/i, 1)',
			'P.regexp(/:([a-z0-9_+-]+(?:@[a-z0-9._-]+)?):/i, 1)',
		);
	}
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
