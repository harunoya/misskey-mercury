<template>
<div class="prlncendiewqqkrevzeruhndoakghvtx">
	<input
		ref="search"
		v-model="q"
		class="search"
		:class="{ filled: q.length > 0 }"
		:placeholder="$t('search-placeholder')"
		type="search"
		autocapitalize="off"
		@keydown.esc.prevent="q = ''"
	/>

	<div class="emojis" ref="emojis">
		<!-- Searching replaces the browsable sections entirely, so a query never has to be cleared
		     before the tab it was typed on can be read again. -->
		<template v-if="q.length > 0">
			<template v-if="searchedCustom.length > 0">
				<header class="category"><fa :icon="faAsterisk" fixed-width/> {{ $t('custom-emoji') }}</header>
				<div class="list">
					<button v-for="emoji in searchedCustom" :key="`s:${emoji.name}`" :title="emoji.name" @click="chosen(emoji)">
						<img :src="$store.state.device.disableShowingAnimatedImages ? getStaticImageUrl(emoji.url) : emoji.url" :alt="emoji.name"/>
					</button>
				</div>
			</template>
			<template v-if="searchedUnicode.length > 0">
				<header class="category"><fa :icon="faLeaf" fixed-width/> {{ $t('unicode-emoji') }}</header>
				<div class="list">
					<button v-for="emoji in searchedUnicode" :key="`s:${emoji.name}`" :title="emoji.name" @click="chosen(emoji)">
						<mk-emoji :emoji="emoji.char"/>
					</button>
				</div>
			</template>
			<p v-if="searchedCustom.length === 0 && searchedUnicode.length === 0" class="empty">{{ $t('not-found') }}</p>
		</template>

		<template v-else>
			<template v-if="tab === 'index'">
				<template v-if="pinnedReactions.length > 0">
					<header class="category"><fa :icon="faStar" fixed-width/> {{ $t('pinned') }}</header>
					<div class="list">
						<button v-for="(reaction, i) in pinnedReactions" :key="`p:${i}`" :title="reaction" @click="chosenReaction(reaction)">
							<mk-reaction-icon :reaction="reaction"/>
						</button>
					</div>
				</template>

				<header class="category"><fa :icon="faHistory" fixed-width/> {{ $t('recent-emoji') }}</header>
				<div v-if="recentEmojis.length > 0" class="list">
					<button v-for="(emoji, i) in recentEmojis" :key="`r:${i}`" :title="emoji.name" @click="chosen(emoji)">
						<mk-emoji v-if="emoji.char != null" :emoji="emoji.char"/>
						<img v-else :src="$store.state.device.disableShowingAnimatedImages ? getStaticImageUrl(emoji.url) : emoji.url" :alt="emoji.name"/>
					</button>
				</div>
				<p v-else class="empty">{{ $t('not-found') }}</p>
			</template>

			<template v-if="tab === 'custom'">
				<div v-for="key in customEmojiCategories" :key="`c:${key}`">
					<header class="sub folder" @click="toggle(`c:${key}`)">
						<fa :icon="isOpen(`c:${key}`) ? faChevronDown : faChevronUp" fixed-width/>
						<span>{{ key || $t('no-category') }}</span>
						<span class="count">{{ customEmojis[key].length }}</span>
					</header>
					<div v-if="isOpen(`c:${key}`)" class="list">
						<button v-for="emoji in customEmojis[key]" :key="emoji.name" :title="emoji.name" @click="chosen(emoji)">
							<img :src="$store.state.device.disableShowingAnimatedImages ? getStaticImageUrl(emoji.url) : emoji.url" :alt="emoji.name"/>
						</button>
					</div>
				</div>
				<p v-if="customEmojiCategories.length === 0" class="empty">{{ $t('not-found') }}</p>
			</template>

			<template v-if="tab === 'unicode'">
				<div v-for="category in unicodeCategories" :key="`u:${category.name}`">
					<header class="sub folder" @click="toggle(`u:${category.name}`)">
						<fa :icon="isOpen(`u:${category.name}`) ? faChevronDown : faChevronUp" fixed-width/>
						<span>{{ category.text }}</span>
						<span class="count">{{ emojisOfCategory(category.name).length }}</span>
					</header>
					<!-- Rendered only while open. All eight categories at once is over 1600 buttons,
					     which is what made this tab slow to open and to scroll. -->
					<div v-if="isOpen(`u:${category.name}`)" class="list">
						<button v-for="emoji in emojisOfCategory(category.name)" :key="emoji.name" :title="emoji.name" @click="chosen(emoji)">
							<mk-emoji :emoji="emoji.char"/>
						</button>
					</div>
				</div>
			</template>
		</template>
	</div>

	<div class="tabs">
		<button :class="{ active: tab === 'index' }" :title="$t('tab-index')" @click="go('index')"><fa :icon="faAsterisk" fixed-width/></button>
		<button :class="{ active: tab === 'custom' }" :title="$t('tab-custom')" @click="go('custom')"><fa :icon="['far', 'laugh']" fixed-width/></button>
		<button :class="{ active: tab === 'unicode' }" :title="$t('tab-unicode')" @click="go('unicode')"><fa :icon="faLeaf" fixed-width/></button>
	</div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../i18n';
import { emojilist } from '../../../../../misc/emojilist';
import { getStaticImageUrl } from '../../../common/scripts/get-static-image-url';
import { faAsterisk, faLeaf, faHistory, faStar, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { groupByX } from '../../../../../prelude/array';

/** How many matches each half of the search results shows before it stops. */
const SEARCH_LIMIT = 32;

export default defineComponent({
	i18n: i18n('common/views/components/emoji-picker.vue'),

	props: {
		/**
		 * Reactions to offer above the recently used ones, as reaction strings.
		 *
		 * The reaction picker passes the account's configured palette here, so the reactions that
		 * used to be the whole picker are still one click away now that everything else is too.
		 */
		pinned: {
			type: Array,
			required: false,
			default: () => []
		}
	},

	data() {
		return {
			getStaticImageUrl,
			faAsterisk, faLeaf, faHistory, faStar, faChevronDown, faChevronUp,
			/** Category keys the reader has expanded. Categories start closed, as in the current client. */
			opened: {} as Record<string, boolean>,
			q: '',
			tab: 'index',
			customEmojis: {} as Record<string, any[]>,
			unicodeCategories: [
				{ name: 'people', text: this.$t('people') },
				{ name: 'animals_and_nature', text: this.$t('animals-and-nature') },
				{ name: 'food_and_drink', text: this.$t('food-and-drink') },
				{ name: 'activity', text: this.$t('activity') },
				{ name: 'travel_and_places', text: this.$t('travel-and-places') },
				{ name: 'objects', text: this.$t('objects') },
				{ name: 'symbols', text: this.$t('symbols') },
				{ name: 'flags', text: this.$t('flags') },
			],
		};
	},

	computed: {
		pinnedReactions(): string[] {
			return (this.pinned as string[]).filter(x => typeof x === 'string' && x.length > 0);
		},

		recentEmojis(): any[] {
			return this.$store.state.device.recentEmojis || [];
		},

		customEmojiCategories(): string[] {
			return Object.keys(this.customEmojis);
		},

		/** Every custom emoji as a flat list, with its aliases folded in for searching. */
		customEmojiList(): any[] {
			return ([] as any[]).concat(...Object.values(this.customEmojis));
		},

		searchedCustom(): any[] {
			const q = this.q.replace(/^:/, '').toLowerCase();
			if (q.length === 0) return [];
			return this.customEmojiList
				.filter((e: any) => e.name.toLowerCase().includes(q) ||
					(e.aliases || []).some((a: string) => a.toLowerCase().includes(q)))
				.slice(0, SEARCH_LIMIT);
		},

		searchedUnicode(): any[] {
			const q = this.q.replace(/^:/, '').toLowerCase();
			if (q.length === 0) return [];
			// Names first, then keywords: typing "cat" should reach 🐱 before every emoji merely
			// tagged with it.
			const byName = emojilist.filter(e => e.name.toLowerCase().includes(q));
			const byKeyword = emojilist.filter(e => !byName.includes(e) &&
				(e.keywords || []).some(k => k.toLowerCase().includes(q)));
			return byName.concat(byKeyword).slice(0, SEARCH_LIMIT);
		},
	},

	created() {
		const local = (this.$root.getMetaSync() || { emojis: [] }).emojis || [];
		this.customEmojis = groupByX(local, (x: any) => x.category || '');

		const savedTab = this.$store.state.device.activeEmojiCategoryName;
		if (savedTab === 'index' || savedTab === 'custom' || savedTab === 'unicode') this.tab = savedTab;
	},

	mounted() {
		// Typing straight into the picker is the fastest way to reach an emoji, and it is what the
		// current client does when the picker opens.
		//
		// `preventScroll` matters here. The picker's host is created detached, appended to the end
		// of `document.body`, and only positioned in the host's own `$nextTick` — which Vue runs
		// after this one, because a child mounts before its parent. Focusing without it therefore
		// scrolls the page to an absolutely-positioned popover that still sits at the bottom of the
		// document, and the reader lands far below where they were. The popover is placed at the
		// element it belongs to, so it never needs the page to move.
		this.$nextTick(() => (this.$refs.search as HTMLInputElement | undefined)?.focus({ preventScroll: true }));
	},

	methods: {
		isOpen(key: string): boolean {
			return this.opened[key] === true;
		},

		toggle(key: string) {
			// Replaced rather than mutated: Vue 2 could not see a new key on a plain object, and the
			// vendored components are still written to that assumption.
			this.opened = { ...this.opened, [key]: !this.isOpen(key) };
		},

		go(tab: string) {
			this.tab = tab;
			this.$store.commit('device/set', { key: 'activeEmojiCategoryName', value: tab });
		},

		emojisOfCategory(name: string): any[] {
			return emojilist.filter(e => e.category === name);
		},

		chosen(emoji: any) {
			const getKey = (e: any) => e.char || `:${e.name}:`;

			let recents = this.$store.state.device.recentEmojis || [];
			recents = recents.filter((e: any) => getKey(e) !== getKey(emoji));
			recents.unshift(emoji);
			this.$store.commit('device/set', { key: 'recentEmojis', value: recents.splice(0, 16) });

			this.$emit('chosen', getKey(emoji));
		},

		/**
		 * Chooses a pinned reaction.
		 *
		 * Those are reaction strings rather than emoji records — `like` is not a character and has no
		 * name to remember — so they are passed straight through without touching the recent list.
		 */
		chosenReaction(reaction: string) {
			this.$emit('chosen', reaction);
		},
	}
});
</script>

<style lang="stylus" scoped>
.prlncendiewqqkrevzeruhndoakghvtx
	display flex
	flex-direction column
	width 350px
	max-width 100vw
	// Fixed, so expanding a category scrolls the list instead of growing the popover — which would
	// otherwise push the whole picker off the bottom of the screen.
	height 400px
	max-height 80vh
	background var(--face)

	> .search
		display block
		flex-shrink 0
		width 100%
		padding 12px 16px
		box-sizing border-box
		border none
		border-bottom solid 1px var(--faceDivider)
		background transparent
		color var(--text)
		font-size 14px
		font-family inherit

		&::placeholder
			color var(--inputPlaceholder)

		&:focus
			outline none

		&.filled
			color var(--textHighlighted)

	> .emojis
		// `min-height 0` is what lets this shrink inside the flex column; without it the content
		// sets the floor and the fixed height above has no effect.
		flex 1 1 0
		min-height 0
		overflow-y auto
		overflow-x hidden

		> .empty
			margin 0
			padding 24px 16px
			text-align center
			color var(--text)
			opacity 0.7
			font-size 13px

		>>> header.category
			position sticky
			top 0
			left 0
			z-index 1
			padding 8px
			background var(--faceHeader)
			color var(--text)
			font-size 12px

		>>> header.sub
			padding 4px 8px
			color var(--text)
			font-size 12px

		>>> header.sub.folder
			display flex
			align-items center
			gap 6px
			padding 8px
			cursor pointer
			user-select none

			&:hover
				color var(--textHighlighted)

			> span
				flex-shrink 0

			> .count
				margin-left auto
				opacity 0.6

		>>> div.list
			display grid
			grid-template-columns 1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr
			gap 4px
			padding 8px

			> button
				padding 0
				width 100%

				&:before
					content ''
					display block
					width 1px
					height 0
					padding-bottom 100%

				&:hover
					> *
						transform scale(1.2)
						transition transform 0s

				> *
					position absolute
					top 0
					left 0
					width 100%
					height 100%
					object-fit contain
					font-size 28px
					transition transform 0.2s ease
					pointer-events none

	> .tabs
		display flex
		flex-shrink 0
		border-top solid 1px var(--faceDivider)

		> button
			flex 1
			padding 10px 0
			font-size 16px
			color var(--text)
			transition color 0.2s ease

			&:hover
				color var(--textHighlighted)
				transition color 0s

			&.active
				color var(--primary)
				transition color 0s

</style>
