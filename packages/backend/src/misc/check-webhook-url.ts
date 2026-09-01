/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import ipaddr from 'ipaddr.js';

const BLOCKED_HOSTNAMES = new Set([
	'localhost',
	'metadata.google.internal',
]);

export class UnsafeWebhookUrlError extends Error {
	constructor() {
		super('Invalid webhook URL.');
		this.name = 'UnsafeWebhookUrlError';
	}
}

function stripIpv6Brackets(hostname: string): string {
	return hostname.startsWith('[') && hostname.endsWith(']')
		? hostname.slice(1, -1)
		: hostname;
}

function isBlockedIpLiteral(hostname: string): boolean {
	const host = stripIpv6Brackets(hostname);
	if (!ipaddr.isValid(host)) return false;
	return ipaddr.parse(host).range() !== 'unicast';
}

function isBlockedHostname(hostname: string): boolean {
	const host = stripIpv6Brackets(hostname).toLowerCase();
	if (BLOCKED_HOSTNAMES.has(host)) return true;
	if (host.endsWith('.localhost') || host.endsWith('.local')) return true;
	return isBlockedIpLiteral(host);
}

function isLinkLocalOrMetadata(hostname: string): boolean {
	const host = stripIpv6Brackets(hostname).toLowerCase();
	if (host === 'metadata.google.internal') return true;
	if (!ipaddr.isValid(host)) return false;
	const range = ipaddr.parse(host).range();
	return range === 'linkLocal' || range === 'carrierGradeNat';
}

/**
 * Webhook destinations must be plain http(s) URLs.
 * Loopback / private / .local hosts are rejected except in `NODE_ENV=test`
 * (e2e delivers to http://localhost:15080). Link-local and cloud-metadata
 * addresses are always rejected.
 */
export function isSafeWebhookUrl(input: string): boolean {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}

	if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
	if (url.username !== '' || url.password !== '') return false;
	if (url.hostname === '') return false;
	if (isLinkLocalOrMetadata(url.hostname)) return false;

	const allowPrivate = process.env.NODE_ENV === 'test';
	if (!allowPrivate && isBlockedHostname(url.hostname)) return false;

	return true;
}

export function assertSafeWebhookUrl(url: string): void {
	if (!isSafeWebhookUrl(url)) {
		throw new UnsafeWebhookUrlError();
	}
}
