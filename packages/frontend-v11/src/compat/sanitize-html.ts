/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const ALLOWED_TAGS = new Set([
	'a', 'abbr', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3',
	'h4', 'h5', 'h6', 'hr', 'i', 'img', 'li', 'ol', 'p', 'pre', 'small', 'span',
	'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
	a: new Set(['href', 'title', 'rel', 'target']),
	img: new Set(['src', 'alt', 'title', 'width', 'height']),
};

const SAFE_URL = /^(https?:|mailto:)/i;

function isSafeUrl(value: string): boolean {
	const trimmed = value.trim();
	if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
	return SAFE_URL.test(trimmed);
}

function sanitizeElement(parent: ParentNode): void {
	for (const child of Array.from(parent.childNodes)) {
		if (child.nodeType !== Node.ELEMENT_NODE) continue;
		const el = child as HTMLElement;
		const tag = el.tagName.toLowerCase();

		if (tag === 'script' || tag === 'style' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'link' || tag === 'meta' || tag === 'svg' || tag === 'math') {
			el.remove();
			continue;
		}

		if (!ALLOWED_TAGS.has(tag)) {
			const fragment = document.createDocumentFragment();
			while (el.firstChild) fragment.appendChild(el.firstChild);
			el.replaceWith(fragment);
			sanitizeElement(parent);
			return;
		}

		const allowed = ALLOWED_ATTRS[tag];
		for (const attr of Array.from(el.attributes)) {
			const name = attr.name.toLowerCase();
			if (name.startsWith('on') || name === 'srcdoc' || name.startsWith('data-')) {
				el.removeAttribute(attr.name);
				continue;
			}
			if (allowed && !allowed.has(name)) {
				el.removeAttribute(attr.name);
				continue;
			}
			if ((name === 'href' || name === 'src') && !isSafeUrl(attr.value)) {
				el.removeAttribute(attr.name);
			}
		}

		sanitizeElement(el);
	}
}

/** Strips active HTML from instance description / similar admin-authored fields. */
export function sanitizeHtml(dirty: string | null | undefined): string {
	if (dirty == null || dirty === '') return '';
	const template = document.createElement('template');
	template.innerHTML = dirty;
	sanitizeElement(template.content);
	return template.innerHTML;
}
