/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Endpoints } from 'misskey-js';
import { sanitizeHtml, toPlainText } from './sanitize-html.js';

export type CurrentApiEndpoint = keyof Endpoints;
export type ApiRequestData = Record<string, unknown>;

type Fetch = typeof globalThis.fetch;
export type SpecialApiEndpoint = 'signin' | 'signup';
export type V11ApiEndpoint = CurrentApiEndpoint | SpecialApiEndpoint;

export interface CurrentApiClientOptions {
	getToken: () => string | null;
	fetch?: Fetch;
	apiBaseUrl?: string;
}

export class CurrentApiError extends Error {
	public readonly status: number;
	public readonly body: unknown;
	public readonly code?: string;
	public readonly id?: string;

	constructor(status: number, body: unknown) {
		const error = isPlainObject(body) && isPlainObject(body.error) ? body.error : body;
		const message = isPlainObject(error) && typeof error.message === 'string'
			? error.message
			: `API request failed with status ${status}`;
		super(message);
		this.name = 'CurrentApiError';
		this.status = status;
		this.body = error;
		this.code = isPlainObject(error) && typeof error.code === 'string' ? error.code : undefined;
		this.id = isPlainObject(error) && typeof error.id === 'string' ? error.id : undefined;
	}
}

export const clientSettingScope = ['mercury', 'v11'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeProfileUpdate(data: ApiRequestData): ApiRequestData {
	const patched: ApiRequestData = {};

	for (const [key, value] of Object.entries(data)) {
		if (value === '') {
			patched[key] = null;
			continue;
		}

		if (key === 'fields' && Array.isArray(value)) {
			patched[key] = value.filter(field => isPlainObject(field)
				&& typeof field.name === 'string' && field.name.length > 0
				&& typeof field.value === 'string' && field.value.length > 0);
			continue;
		}

		patched[key] = value;
	}

	return patched;
}

function toCurrentReaction(reaction: string): string {
	const localCustomEmoji = /^:([^:@]+):$/.exec(reaction);
	return localCustomEmoji == null ? reaction : `:${localCustomEmoji[1]}@.:`;
}

function prepareRequest(endpoint: string, data: ApiRequestData): ApiRequestData {
	if (endpoint === 'i/update') return normalizeProfileUpdate(data);

	if (endpoint === 'notes/reactions/create' && typeof data.reaction === 'string') {
		return { ...data, reaction: toCurrentReaction(data.reaction) };
	}

	if (endpoint === 'i/registry/set' && data.value === undefined) {
		return { ...data, value: null };
	}

	return { ...data };
}

function isEmojiCarrier(value: Record<string, unknown>): boolean {
	if (typeof value.id !== 'string') return false;
	return typeof value.username === 'string' || typeof value.userId === 'string';
}

export function normalizeEmojis(value: unknown, instanceEmojis: readonly unknown[]): unknown {
	if (Array.isArray(value)) {
		for (const entry of value) normalizeEmojis(entry, instanceEmojis);
		return value;
	}

	if (!isPlainObject(value)) return value;

	for (const [key, child] of Object.entries(value)) {
		if (key === 'emojis' && isPlainObject(child)) {
			value[key] = Object.entries(child).map(([name, url]) => ({ name, url }));
			continue;
		}
		normalizeEmojis(child, instanceEmojis);
	}

	if (!('emojis' in value) && isEmojiCarrier(value)) value.emojis = instanceEmojis;
	return value;
}

const LOCAL_REACTION = /^:([^:@]+)@\.:$/;

export function toV11Reaction(reaction: string): string {
	const match = LOCAL_REACTION.exec(reaction);
	return match == null ? reaction : `:${match[1]}:`;
}

export function normalizeReactions(value: unknown): unknown {
	if (Array.isArray(value)) {
		for (const entry of value) normalizeReactions(entry);
		return value;
	}
	if (!isPlainObject(value)) return value;

	for (const [key, child] of Object.entries(value)) {
		if (key === 'reactions' && isPlainObject(child)) {
			value[key] = Object.fromEntries(Object.entries(child).map(([name, count]) => [toV11Reaction(name), count]));
			continue;
		}
		if ((key === 'myReaction' || key === 'reaction') && typeof child === 'string') {
			value[key] = toV11Reaction(child);
			continue;
		}
		normalizeReactions(child);
	}

	return value;
}

/**
 * The v11 component tree keeps its original `$root.api()` surface, but all transport and current
 * schema adaptation lives here. No global `fetch` monkey patch is installed and no legacy endpoint
 * alias is accepted: call sites must name an endpoint that exists in the current backend.
 */
export class CurrentApiClient {
	private readonly getToken: () => string | null;
	private readonly fetch: Fetch;
	private readonly apiBaseUrl: string;
	private emojiListPromise: Promise<readonly unknown[]> | null = null;
	private announcementsPromise: Promise<unknown[]> | null = null;
	private instanceEmojis: readonly unknown[] = [];

	constructor(options: CurrentApiClientOptions) {
		this.getToken = options.getToken;
		this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.apiBaseUrl = (options.apiBaseUrl ?? '/api').replace(/\/$/, '');
	}

	public request<E extends CurrentApiEndpoint>(
		endpoint: E,
		data?: Endpoints[E]['req'],
	): Promise<Endpoints[E]['res']>;
	public request(endpoint: SpecialApiEndpoint, data?: ApiRequestData): Promise<unknown>;
	public request(endpoint: V11ApiEndpoint, data?: ApiRequestData): Promise<unknown>;
	public async request(endpoint: CurrentApiEndpoint | SpecialApiEndpoint, data: ApiRequestData = {}): Promise<unknown> {
		if (endpoint.includes('://')) throw new TypeError('Only same-origin current backend endpoints are allowed');

		const response = await this.requestRaw(endpoint, data);
		normalizeEmojis(response, this.instanceEmojis);
		normalizeReactions(response);

		if (endpoint === 'meta' && isPlainObject(response)) await this.backfillMeta(response);
		if (endpoint === 'i' && isPlainObject(response)) {
			response.hasUnreadMessagingMessage ??= response.hasUnreadChatMessages ?? false;
			if (response.clientData == null) {
				const clientData = await this.fetchClientData();
				if (clientData != null) response.clientData = clientData;
			}
		}

		if (endpoint.startsWith('admin/emoji/')) this.invalidateEmojiCache();
		if (endpoint.startsWith('admin/announcements/')) this.announcementsPromise = null;

		return response;
	}

	public warmCaches(): void {
		void this.fetchEmojiList();
	}

	private async requestRaw(endpoint: string, data: ApiRequestData): Promise<unknown> {
		const body = prepareRequest(endpoint, data);
		const token = this.getToken();
		if (token != null && endpoint !== 'signin' && endpoint !== 'signup') body.i = token;

		const response = await this.fetch(`${this.apiBaseUrl}/${endpoint}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			credentials: endpoint === 'signin' ? 'include' : 'same-origin',
			cache: 'no-store',
		});

		let responseBody: unknown;
		if (response.status !== 204) {
			const contentType = response.headers.get('Content-Type') ?? '';
			responseBody = contentType.includes('application/json')
				? await response.json()
				: await response.text();
		}

		if (!response.ok) throw new CurrentApiError(response.status, responseBody);
		return responseBody;
	}

	private async fetchClientData(): Promise<Record<string, unknown> | null> {
		if (this.getToken() == null) return null;
		try {
			const body = await this.requestRaw('i/registry/get-all', { scope: [...clientSettingScope] });
			return isPlainObject(body) ? body : null;
		} catch (error) {
			console.error('[frontend-v11] could not load account settings', error);
			return null;
		}
	}

	private fetchEmojiList(): Promise<readonly unknown[]> {
		this.emojiListPromise ??= this.requestRaw('emojis', {})
			.then(body => isPlainObject(body) && Array.isArray(body.emojis) ? body.emojis : [])
			.catch(error => {
				console.error('[frontend-v11] could not load custom emojis', error);
				return [];
			})
			.then(list => (this.instanceEmojis = list));
		return this.emojiListPromise;
	}

	private fetchAnnouncements(): Promise<unknown[]> {
		this.announcementsPromise ??= this.requestRaw('announcements', { limit: 100, isActive: true })
			.then(body => {
				if (!Array.isArray(body)) return [];
				return body.map(item => isPlainObject(item)
					? { ...item, title: typeof item.title === 'string' ? toPlainText(item.title) : item.title }
					: item);
			})
			.catch(error => {
				console.error('[frontend-v11] could not load announcements', error);
				return [];
			});
		return this.announcementsPromise;
	}

	private async backfillMeta(meta: Record<string, unknown>): Promise<void> {
		if (!Array.isArray(meta.emojis)) meta.emojis = await this.fetchEmojiList();
		if (!Array.isArray(meta.announcements)) meta.announcements = await this.fetchAnnouncements();
		if (typeof meta.description === 'string') meta.description = sanitizeHtml(meta.description);

		meta.enableEmojiReaction ??= true;
		const policies = isPlainObject(meta.policies) ? meta.policies : {};
		meta.disableLocalTimeline ??= policies.ltlAvailable === false;
		meta.disableGlobalTimeline ??= policies.gtlAvailable === false;
		meta.ToSUrl ??= meta.tosUrl ?? null;
	}

	private invalidateEmojiCache(): void {
		this.emojiListPromise = null;
		this.instanceEmojis = [];
	}
}
