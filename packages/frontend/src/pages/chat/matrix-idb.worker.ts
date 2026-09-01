/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IndexedDBStoreWorker } from 'matrix-js-sdk/lib/indexeddb-worker.js';

const worker = new IndexedDBStoreWorker(postMessage.bind(self));
onmessage = (event: MessageEvent) => worker.onMessage(event);
