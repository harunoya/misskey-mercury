<template>
<div>
	<ui-card>
		<template #title><fa icon="plus"/> {{ $t('add-emoji.title') }}</template>
		<section class="fit-top">
			<ui-horizon-group inputs>
				<ui-input :value="name" @input="name = $event">
					<span>{{ $t('add-emoji.name') }}</span>
					<template #desc>{{ $t('add-emoji.name-desc') }}</template>
				</ui-input>
				<ui-input :value="category" @input="category = $event" :datalist="categoryList">
					<span>{{ $t('add-emoji.category') }}</span>
				</ui-input>
				<ui-input :value="aliases" @input="aliases = $event">
					<span>{{ $t('add-emoji.aliases') }}</span>
					<template #desc>{{ $t('add-emoji.aliases-desc') }}</template>
				</ui-input>
			</ui-horizon-group>
			<ui-input :value="url" @input="url = $event">
				<template #icon><fa icon="link"/></template>
				<span>{{ $t('add-emoji.url') }}</span>
			</ui-input>
			<ui-info>{{ $t('add-emoji.info') }}</ui-info>
			<ui-button @click="add">{{ $t('add-emoji.add') }}</ui-button>
		</section>
	</ui-card>

	<ui-card>
		<template #title><fa :icon="faGrin"/> {{ $t('emojis.title') }}</template>
		<section v-for="emoji in emojis" :key="emoji.name" class="oryfrbft">
			<div>
				<img :src="emoji.url" :alt="emoji.name" style="width: 64px;"/>
			</div>
			<div>
				<ui-horizon-group>
					<ui-input :value="emoji.name" @input="emoji.name = $event">
						<span>{{ $t('add-emoji.name') }}</span>
					</ui-input>
					<ui-input :value="emoji.category" @input="emoji.category = $event" :datalist="categoryList">
						<span>{{ $t('add-emoji.category') }}</span>
					</ui-input>
					<ui-input :value="emoji.aliases" @input="emoji.aliases = $event">
						<span>{{ $t('add-emoji.aliases') }}</span>
					</ui-input>
				</ui-horizon-group>
				<ui-input :value="emoji.url" @input="emoji.url = $event">
					<template #icon><fa icon="link"/></template>
					<span>{{ $t('add-emoji.url') }}</span>
				</ui-input>
				<ui-horizon-group class="fit-bottom">
					<ui-button @click="updateEmoji(emoji)"><fa :icon="['far', 'save']"/> {{ $t('emojis.update') }}</ui-button>
					<ui-button @click="removeEmoji(emoji)"><fa :icon="['far', 'trash-alt']"/> {{ $t('emojis.remove') }}</ui-button>
				</ui-horizon-group>
			</div>
		</section>
	</ui-card>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../i18n';
import { faGrin } from '@fortawesome/free-regular-svg-icons';
import { unique } from '../../../../prelude/array';
import { fetchAllCustomEmojis, uploadEmojiSource } from '@compat/admin-emoji';

export default defineComponent({
	i18n: i18n('admin/views/emoji.vue'),
	data() {
		return {
			name: '',
			category: '',
			url: '',
			aliases: '',
			emojis: [],
			faGrin
		};
	},

	mounted() {
		this.fetchEmojis();
	},

	computed: {
		categoryList() {
			return unique(this.emojis.map((x: any) => x.category || '').filter((x: string) => x !== ''));
		}
	},

	methods: {
		async add() {
			try {
				const file = await uploadEmojiSource(this.$root, this.url);
				await this.$root.api('admin/emoji/add', {
					name: this.name,
					category: this.category || null,
					fileId: file.id,
					aliases: this.aliases.split(' ').filter(x => x.length > 0)
				});
				this.$root.dialog({
					type: 'success',
					text: this.$t('add-emoji.added')
				});
				await this.fetchEmojis();
			} catch (e) {
				this.$root.dialog({
					type: 'error',
					text: e.toString()
				});
			}
		},

		async fetchEmojis() {
			try {
				const emojis = await fetchAllCustomEmojis(this.$root);
				for (const e of emojis) {
					e.aliases = (e.aliases || []).join(' ');
					e._savedUrl = e.url;
				}
				this.emojis = emojis;
			} catch (e) {
				this.$root.dialog({ type: 'error', text: e.toString() });
			}
		},

		async updateEmoji(emoji) {
			try {
				const file = emoji.url !== emoji._savedUrl ? await uploadEmojiSource(this.$root, emoji.url) : null;
				await this.$root.api('admin/emoji/update', {
					id: emoji.id,
					name: emoji.name,
					category: emoji.category || null,
					...(file ? { fileId: file.id } : {}),
					aliases: emoji.aliases.split(' ').filter(x => x.length > 0)
				});
				emoji._savedUrl = emoji.url;
				this.$root.dialog({
					type: 'success',
					text: this.$t('updated')
				});
			} catch (e) {
				this.$root.dialog({
					type: 'error',
					text: e.toString()
				});
			}
		},

		removeEmoji(emoji) {
			this.$root.dialog({
				type: 'warning',
				text: this.$t('remove-emoji.are-you-sure').replace('$1', emoji.name),
				showCancelButton: true
			}).then(({ canceled }) => {
				if (canceled) return;

				this.$root.api('admin/emoji/delete', {
					id: emoji.id
				}).then(() => {
					this.$root.dialog({
						type: 'success',
						text: this.$t('remove-emoji.removed')
					});
					this.fetchEmojis();
				}).catch(e => {
					this.$root.dialog({
						type: 'error',
						text: e
					});
				});
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.oryfrbft
	@media (min-width 500px)
		display flex

	> div:first-child
		@media (max-width 500px)
			padding-bottom 16px

		> img
			vertical-align bottom

	> div:last-child
		flex 1

		@media (min-width 500px)
			padding-left 16px

</style>
