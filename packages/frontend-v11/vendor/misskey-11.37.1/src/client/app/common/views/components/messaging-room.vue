<template>
<div class="mk-messaging-room"
	@dragover.prevent.stop="onDragover"
	@drop.prevent.stop="onDrop"
>
	<div class="body" ref="body">
		<p class="init" v-if="init"><fa icon="spinner" pulse fixed-width/>{{ $t('@.loading') }}</p>
		<p class="empty" v-if="!init && messages.length == 0"><fa icon="info-circle"/>{{ user ? $t('not-talked-user') : $t('not-talked-group') }}</p>
		<p class="no-history" v-if="!init && messages.length > 0 && !existMoreMessages"><fa :icon="faFlag"/>{{ $t('no-history') }}</p>
		<button class="more" :class="{ fetching: fetchingMoreMessages }" v-if="existMoreMessages" @click="fetchMoreMessages" :disabled="fetchingMoreMessages">
			<template v-if="fetchingMoreMessages"><fa icon="spinner" pulse fixed-width/></template>{{ fetchingMoreMessages ? $t('@.loading') : $t('@.load-more') }}
		</button>
		<template v-for="(message, i) in _messages" :key="message.id">
			<x-message :message="message" :is-group="group != null"/>
			<p class="date" v-if="i != messages.length - 1 && message._date != _messages[i + 1]._date">
				<span>{{ _messages[i + 1]._datetext }}</span>
			</p>
		</template>
	</div>
	<footer>
		<transition name="fade">
			<div class="new-message" v-show="showIndicator">
				<button @click="onIndicatorClick"><i><fa :icon="faArrowCircleDown"/></i>{{ $t('new-message') }}</button>
			</div>
		</transition>
		<x-form :user="user" :group="group" ref="form"/>
	</footer>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../i18n';
import XMessage from './messaging-room.message.vue';
import XForm from './messaging-room.form.vue';
import { url } from '../../../config';
import { faArrowCircleDown, faFlag } from '@fortawesome/free-solid-svg-icons';
import { toV11ChatMessage } from '@compat/chat';

export default defineComponent({
	i18n: i18n('common/views/components/messaging-room.vue'),

	components: {
		XMessage,
		XForm
	},

	props: {
		user: {
			type: Object,
			requird: false,
		},
		group: {
			type: Object,
			requird: false,
		},
		isNaked: {
			type: Boolean,
			requird: false,
		},
	},

	data() {
		return {
			init: true,
			fetchingMoreMessages: false,
			messages: [],
			existMoreMessages: false,
			connection: null,
			showIndicator: false,
			timer: null,
			// Whether the reader was sitting at the newest message the last time we looked. Read
			// when something changes the content height on its own — an image finishing loading,
			// a message arriving — to decide between following along and leaving them where they
			// are. It has to be remembered rather than measured at that moment, because by then
			// the height has already changed and the answer would always be "no".
			pinnedToBottom: true,
			bodyResizeObserver: null,
			faArrowCircleDown, faFlag
		};
	},

	computed: {
		_messages(): any[] {
			return (this.messages as any).map(message => {
				const date = new Date(message.createdAt).getDate();
				const month = new Date(message.createdAt).getMonth() + 1;
				message._date = date;
				message._datetext = this.$t('@.month-and-day').replace('{month}', month.toString()).replace('{day}', date.toString());
				return message;
			});
		},

		form(): any {
			return this.$refs.form;
		}
	},

	mounted() {
		this.connection = this.user
			? this.$root.stream.connectToChannel('chatUser', { otherId: this.user.id })
			: this.$root.stream.connectToChannel('chatRoom', { roomId: this.group.id });

		this.connection.on('message', this.onMessage);
		this.connection.on('read', this.onRead);
		this.connection.on('deleted', this.onDeleted);

		if (this.isNaked) {
			window.addEventListener('scroll', this.onScroll, { passive: true });
		} else {
			this.$el.addEventListener('scroll', this.onScroll, { passive: true });
		}

		document.addEventListener('visibilitychange', this.onVisibilitychange);

		// Attachments settle their height after the message is already in the DOM, so the position
		// computed when the messages arrived is short-lived. Watching the list itself covers every
		// such case (images, video, embeds) without having to hook each one.
		if (typeof ResizeObserver !== 'undefined') {
			this.bodyResizeObserver = new ResizeObserver(() => {
				if (this.pinnedToBottom) this.scrollToBottom();
			});
			this.bodyResizeObserver.observe(this.$refs.body as Element);
		}

		this.fetchMessages().then(() => {
			this.init = false;
			// The messages were only just handed to Vue; the DOM still holds the loading line, so
			// `scrollHeight` here would be the height of an empty room. Waiting for the render is
			// what makes the room actually open at the newest message.
			this.$nextTick(() => this.scrollToBottom());
		});
	},

	beforeUnmount() {
		this.connection.dispose();

		if (this.isNaked) {
			window.removeEventListener('scroll', this.onScroll);
		} else {
			this.$el.removeEventListener('scroll', this.onScroll);
		}

		document.removeEventListener('visibilitychange', this.onVisibilitychange);

		this.bodyResizeObserver?.disconnect();
		this.bodyResizeObserver = null;

		if (this.timer) clearTimeout(this.timer);
	},

	methods: {
		onDragover(e) {
			const isFile = e.dataTransfer.items[0].kind == 'file';
			const isDriveFile = e.dataTransfer.types[0] == 'mk_drive_file';

			if (isFile || isDriveFile) {
				e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed == 'all' ? 'copy' : 'move';
			} else {
				e.dataTransfer.dropEffect = 'none';
			}
		},

		onDrop(e): void {
			// ファイルだったら
			if (e.dataTransfer.files.length == 1) {
				this.form.upload(e.dataTransfer.files[0]);
				return;
			} else if (e.dataTransfer.files.length > 1) {
				this.$root.dialog({
					type: 'error',
					text: this.$t('only-one-file-attached')
				});
				return;
			}

			//#region ドライブのファイル
			const driveFile = e.dataTransfer.getData('mk_drive_file');
			if (driveFile != null && driveFile != '') {
				const file = JSON.parse(driveFile);
				this.form.file = file;
			}
			//#endregion
		},

		fetchMessages() {
			return new Promise((resolve, reject) => {
				const max = this.existMoreMessages ? 20 : 10;
				// Read before the response can reassign it: this call is a page of older history
				// only if there was already history on screen to page back from.
				const isPrepend = this.existMoreMessages;

				const pagination = {
					limit: max + 1,
					untilId: this.existMoreMessages ? this.messages[0].id : undefined,
				};
				const request = this.user
					? this.$root.api('chat/messages/user-timeline', { ...pagination, userId: this.user.id })
					: this.$root.api('chat/messages/room-timeline', { ...pagination, roomId: this.group.id });
				request.then(messages => {
					messages = messages.map(message => toV11ChatMessage(message, this.$store.state.i, this.user));
					if (messages.length == max + 1) {
						this.existMoreMessages = true;
						messages.pop();
					} else {
						this.existMoreMessages = false;
					}

					// Older messages go in above whatever the reader is looking at. The browser keeps
					// `scrollTop` across that insertion, so the message under their eyes would slide
					// down by the height of everything just added. Measuring the distance to the
					// bottom instead — which the insertion does not change — and restoring it after
					// the render keeps that message exactly where it was.
					const anchor = isPrepend ? this.distanceFromBottom() : null;

					this.messages.unshift.apply(this.messages, messages.reverse());

					if (anchor == null) {
						resolve();
						return;
					}

					this.$nextTick(() => {
						const el = this.scrollEl();
						if (el != null) el.scrollTop = el.scrollHeight - anchor;
						resolve();
					});
				});
			});
		},

		fetchMoreMessages() {
			this.fetchingMoreMessages = true;
			this.fetchMessages().then(() => {
				this.fetchingMoreMessages = false;
			});
		},

		onMessage(message) {
			message = toV11ChatMessage(message, this.$store.state.i, this.user);
			// サウンドを再生する
			if (this.$store.state.device.enableSounds) {
				const sound = new Audio(`${url}/assets/message.mp3`);
				sound.volume = this.$store.state.device.soundVolume;
				sound.play();
			}

			// Measured before the message is added, while the answer still describes where the
			// reader chose to be rather than what the new message did to the height.
			const isBottom = this.isBottom();
			// A message the reader just sent follows them down even if they had scrolled up: they
			// are the one who caused it, and a chat that does not show your own message looks broken.
			const isMine = message.userId === this.$store.state.i.id;

			this.messages.push(message);
			if (message.userId != this.$store.state.i.id && !document.hidden) {
				this.connection.send('read', {});
			}

			if (isBottom || isMine) {
				// Scroll to bottom
				this.$nextTick(() => {
					this.scrollToBottom();
				});
			} else {
				// Notify
				this.pinnedToBottom = false;
				this.notifyNewMessage();
			}
		},

		onRead(x) {
			if (this.user) {
				if (!Array.isArray(x)) x = [x];
				for (const id of x) {
					if (this.messages.some(x => x.id == id)) {
						const exist = this.messages.map(x => x.id).indexOf(id);
						this.messages[exist].isRead = true;
					}
				}
			} else if (this.group) {
				for (const id of x.ids) {
					if (this.messages.some(x => x.id == id)) {
						const exist = this.messages.map(x => x.id).indexOf(id);
						this.messages[exist].reads.push(x.userId);
					}
				}
			}
		},

		onDeleted(id) {
			const msg = this.messages.find(m => m.id === id);
			if (msg) {
				this.messages = this.messages.filter(m => m.id !== msg.id);
			}
		},

		/**
		 * The element that actually scrolls.
		 *
		 * Embedded in a page the room scrolls itself; opened as its own page ("naked") the document
		 * does. Every measurement and every write goes through this one accessor, because the two
		 * used to be described with different quantities — `window.scrollY + innerHeight` against
		 * `document.body.offsetHeight` — which are not the same axis as the container's own
		 * `scrollTop`/`scrollHeight`, and the mismatch made "am I at the bottom?" answer wrongly
		 * whenever the body carried a margin.
		 */
		scrollEl() {
			return this.isNaked ? (document.scrollingElement ?? document.documentElement) : this.$el;
		},

		distanceFromBottom() {
			const el = this.scrollEl();
			return el == null ? 0 : el.scrollHeight - el.scrollTop;
		},

		isBottom() {
			const asobi = 64;
			const el = this.scrollEl();
			if (el == null) return true;
			return el.scrollTop + el.clientHeight > el.scrollHeight - asobi;
		},

		scrollToBottom() {
			const el = this.scrollEl();
			if (el == null) return;
			el.scrollTop = el.scrollHeight;
			this.pinnedToBottom = true;
		},

		onIndicatorClick() {
			this.showIndicator = false;
			this.scrollToBottom();
		},

		notifyNewMessage() {
			this.showIndicator = true;

			if (this.timer) clearTimeout(this.timer);

			this.timer = setTimeout(() => {
				this.showIndicator = false;
			}, 4000);
		},

		onScroll() {
			this.pinnedToBottom = this.isBottom();
			if (this.pinnedToBottom) {
				this.showIndicator = false;
			}
		},

		onVisibilitychange() {
			if (document.hidden) return;
			for (const message of this.messages) {
				if (message.userId !== this.$store.state.i.id && !message.isRead) {
					this.connection.send('read', {});
				}
			}
		}
	}
});
</script>

<style lang="stylus" scoped>
.mk-messaging-room
	background var(--messagingRoomBg)

	> .body
		width 100%
		max-width 600px
		margin 0 auto
		min-height calc(100% - 103px)

		> .init,
		> .empty
			width 100%
			margin 0
			padding 16px 8px 8px 8px
			text-align center
			font-size 0.8em
			color var(--messagingRoomInfo)
			opacity 0.5

			[data-icon]
				margin-right 4px

		> .no-history
			display block
			margin 0
			padding 16px
			text-align center
			font-size 0.8em
			color var(--messagingRoomInfo)
			opacity 0.5

			[data-icon]
				margin-right 4px

		> .more
			display block
			margin 16px auto
			padding 0 12px
			line-height 24px
			color #fff
			background rgba(#000, 0.3)
			border-radius 12px

			&:hover
				background rgba(#000, 0.4)

			&:active
				background rgba(#000, 0.5)

			&.fetching
				cursor wait

			> [data-icon]
				margin-right 4px

		> .message
			// something

		> .date
			display block
			margin 8px 0
			text-align center

			&:before
				content ''
				display block
				position absolute
				height 1px
				width 90%
				top 16px
				left 0
				right 0
				margin 0 auto
				background var(--messagingRoomDateDividerLine)

			> span
				display inline-block
				margin 0
				padding 0 16px
				//font-weight bold
				line-height 32px
				color var(--messagingRoomDateDividerText)
				background var(--messagingRoomBg)

	> footer
		position -webkit-sticky
		position sticky
		z-index 2
		bottom 0
		width 100%
		max-width 600px
		margin 0 auto
		padding 0
		background var(--messagingRoomBg)
		background-clip content-box

		> .new-message
			position absolute
			top -48px
			width 100%
			padding 8px 0
			text-align center

			> button
				display inline-block
				margin 0
				padding 0 12px 0 30px
				cursor pointer
				line-height 32px
				font-size 12px
				color var(--primaryForeground)
				background var(--primary)
				border-radius 16px

				&:hover
					background var(--primaryLighten10)

				&:active
					background var(--primaryDarken10)

				> i
					position absolute
					top 0
					left 10px
					line-height 32px
					font-size 16px

.fade-enter-active, .fade-leave-active
	transition opacity 0.1s

.fade-enter-from, .fade-leave-to
	transition opacity 0.5s
	opacity 0

</style>
