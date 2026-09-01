/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

interface CurrentApRequestChart {
	deliverFailed?: number[];
	deliverSucceeded?: number[];
	inboxReceived?: number[];
}

function numberSeries(value: unknown): number[] {
	return Array.isArray(value) ? value.map(entry => typeof entry === 'number' ? entry : 0) : [];
}

/** Maps the metrics that still exist in the current AP-request chart to the v11 dashboard model. */
export function toV11NetworkChart(chart: CurrentApRequestChart): Record<string, number[]> {
	const deliverFailed = numberSeries(chart.deliverFailed);
	const deliverSucceeded = numberSeries(chart.deliverSucceeded);
	const length = Math.max(deliverFailed.length, deliverSucceeded.length);
	const outgoingRequests = Array.from({ length }, (_, index) =>
		(deliverFailed[index] ?? 0) + (deliverSucceeded[index] ?? 0));

	return {
		incomingRequests: numberSeries(chart.inboxReceived),
		outgoingRequests,
		failedRequests: deliverFailed,
	};
}
