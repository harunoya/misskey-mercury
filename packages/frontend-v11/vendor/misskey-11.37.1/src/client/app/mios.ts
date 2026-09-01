import autobind from 'autobind-decorator';
import Vue, { VueApp } from 'vue';
import { EventEmitter } from 'eventemitter3';
import { v4 as uuid } from 'uuid';
import { CurrentApiClient, CurrentApiError } from '@compat/api';
import type { ApiRequestData, V11ApiEndpoint } from '@compat/api';

import initStore from './store';
import { locale } from './config';
import Progress from './common/scripts/loading';

import Err from './common/views/components/connect-failed.vue';
import Stream from './common/scripts/stream';

//#region api requests
let spinner = null;
let pending = 0;
//#endregion

/**
 * Misskey Operating System
 */
export default class MiOS extends EventEmitter {
	private readonly apiClient: CurrentApiClient;

	/**
	 * Misskeyの /meta で取得できるメタ情報
	 */
	private meta: {
		data: { [x: string]: any };
		chachedAt: Date;
	};

	public get instanceName() {
		const siteName = document.querySelector('meta[property="og:site_name"]') as HTMLMetaElement;
		if (siteName && siteName.content) {
			return siteName.content;
		}

		return 'Misskey';
	}

	private isMetaFetching = false;

	public app: Vue;

	/**
	 * Whether is debug mode
	 */
	public get debug() {
		return this.store ? this.store.state.device.debug : false;
	}

	public store: ReturnType<typeof initStore>;

	/**
	 * A connection manager of home stream
	 */
	public stream: Stream;

	/**
	 * A registration of service worker
	 */

	/**
	 * Whether should register ServiceWorker
	 */

	/**
	 * ウィンドウシステム
	 */
	public windows = new WindowSystem();

	/**
	 * MiOSインスタンスを作成します
	 * @param shouldRegisterSw ServiceWorkerを登録するかどうか
	 */
	constructor() {
		super();

		this.apiClient = new CurrentApiClient({
			getToken: () => this.store?.state.i?.token ?? localStorage.getItem('i'),
		});
		this.apiClient.warmCaches();

		if (this.debug) {
			(window as any).os = this;
		}
	}

	@autobind
	public log(...args) {
		if (!this.debug) return;
		console.log.apply(null, args);
	}

	@autobind
	public logInfo(...args) {
		if (!this.debug) return;
		console.info.apply(null, args);
	}

	@autobind
	public logWarn(...args) {
		if (!this.debug) return;
		console.warn.apply(null, args);
	}

	@autobind
	public logError(...args) {
		if (!this.debug) return;
		console.error.apply(null, args);
	}

	@autobind
	public signout() {
		this.store.dispatch('logout');
		location.href = '/';
	}

	/**
	 * Initialize MiOS (boot)
	 * @param callback A function that call when initialized
	 */
	@autobind
	public async init(callback) {
		this.store = initStore(this);

		// ユーザーをフェッチしてコールバックする
		const fetchme = (token, cb) => {
			let me = null;

			// Return when not signed in
			if (token == null) {
				return done();
			}

			this.apiClient.request('i').then(i => {
				me = i;
				me.token = token;
				done();
			}).catch(error => {
				if (error instanceof CurrentApiError && error.status < 500) {
					this.signout();
					return;
				}

				// Render the error screen
				document.body.innerHTML = '<div id="err"></div>';
				new VueApp({
					render: createEl => createEl(Err)
				}).$mount('#err');

				Progress.done();
			});

			function done() {
				if (cb) cb(me);
			}
		};

		// フェッチが完了したとき
		const fetched = () => {
			this.emit('signedin');

			this.initStream();

			// Finish init
			callback();

		};

		// キャッシュがあったとき
		if (this.store.state.i != null) {
			if (this.store.state.i.token == null) {
				this.signout();
				return;
			}

			// とりあえずキャッシュされたデータでお茶を濁して(?)おいて、
			fetched();

			// 後から新鮮なデータをフェッチ
			fetchme(this.store.state.i.token, freshData => {
				this.store.dispatch('mergeMe', freshData);
			});
		} else {
			// Get token from cookie or localStorage
			const i = (document.cookie.match(/i=(\w+)/) || [null, null])[1] || localStorage.getItem('i');

			fetchme(i, me => {
				if (me) {
					this.store.dispatch('login', me);
					fetched();
				} else {
					this.initStream();

					// Finish init
					callback();
				}
			});
		}
	}

	@autobind
	private initStream() {
		this.stream = new Stream(this);

		if (this.store.getters.isSignedIn) {
			const main = this.stream.useSharedConnection('main');

			// 自分の情報が更新されたとき
			main.on('meUpdated', i => {
				this.store.dispatch('mergeMe', i);
			});

			main.on('readAllNotifications', () => {
				this.store.dispatch('mergeMe', {
					hasUnreadNotification: false
				});
			});

			main.on('unreadNotification', () => {
				this.store.dispatch('mergeMe', {
					hasUnreadNotification: true
				});
			});

			main.on('newChatMessage', () => {
				this.store.dispatch('mergeMe', {
					hasUnreadMessagingMessage: true
				});
			});

			main.on('unreadMention', () => {
				this.store.dispatch('mergeMe', {
					hasUnreadMentions: true
				});
			});

			main.on('readAllUnreadMentions', () => {
				this.store.dispatch('mergeMe', {
					hasUnreadMentions: false
				});
			});

			main.on('unreadSpecifiedNote', () => {
				this.store.dispatch('mergeMe', {
					hasUnreadSpecifiedNotes: true
				});
			});

			main.on('readAllUnreadSpecifiedNotes', () => {
				this.store.dispatch('mergeMe', {
					hasUnreadSpecifiedNotes: false
				});
			});

			main.on('registryUpdated', x => {
				if (!Array.isArray(x.scope) || x.scope.join('/') !== 'mercury/v11') return;
				this.store.commit('settings/set', {
					key: x.key,
					value: x.value
				});
			});

			// トークンが再生成されたとき
			// このままではMisskeyが利用できないので強制的にサインアウトさせる
			main.on('myTokenRegenerated', () => {
				alert(locale['common']['my-token-regenerated']);
				this.signout();
			});
		}
	}

	public requests = [];

	/**
	 * Misskey APIにリクエストします
	 * @param endpoint エンドポイント名
	 * @param data パラメータ
	 */
	@autobind
	public api(endpoint: string, data: ApiRequestData = {}, silent = false): Promise<any> {
		if (!silent) {
			if (++pending === 1) {
				spinner = document.createElement('div');
				spinner.setAttribute('id', 'wait');
				document.body.appendChild(spinner);
			}
		}

		const onFinally = () => {
			if (!silent) {
				if (--pending === 0) spinner.parentNode.removeChild(spinner);
			}
		};

		const promise = new Promise((resolve, reject) => {
			const req = {
				id: uuid(),
				date: new Date(),
				name: endpoint,
				data,
				res: null,
				status: null
			};

			if (this.debug) {
				this.requests.push(req);
			}

			this.apiClient.request(endpoint as V11ApiEndpoint, data).then(body => {
				if (this.debug) {
					req.status = 200;
					req.res = body;
				}
				resolve(body);
			}).catch(error => {
				if (this.debug) {
					req.status = error instanceof CurrentApiError ? error.status : 0;
					req.res = error;
				}
				reject(error);
			});
		});

		promise.then(onFinally, onFinally);

		return promise;
	}

	/**
	 * Misskeyのメタ情報を取得します
	 */
	@autobind
	public getMetaSync() {
		return this.meta ? this.meta.data : null;
	}

	/**
	 * Misskeyのメタ情報を取得します
	 * @param force キャッシュを無視するか否か
	 */
	@autobind
	public getMeta(force = false) {
		return new Promise<{ [x: string]: any }>(async (res, rej) => {
			if (this.isMetaFetching) {
				this.once('_meta_fetched_', () => {
					res(this.meta.data);
				});
				return;
			}

			const expire = 1000 * 60; // 1min

			// forceが有効, meta情報を保持していない or 期限切れ
			if (force || this.meta == null || Date.now() - this.meta.chachedAt.getTime() > expire) {
				this.isMetaFetching = true;
				const meta = await this.api('meta', {
					detail: false
				});
				this.meta = {
					data: meta,
					chachedAt: new Date()
				};
				this.isMetaFetching = false;
				this.emit('_meta_fetched_');
				res(meta);
			} else {
				res(this.meta.data);
			}
		});
	}
}

class WindowSystem extends EventEmitter {
	public windows = new Set();

	public add(window) {
		this.windows.add(window);
		this.emit('added', window);
	}

	public remove(window) {
		this.windows.delete(window);
		this.emit('removed', window);
	}

	public getAll() {
		return this.windows;
	}
}
