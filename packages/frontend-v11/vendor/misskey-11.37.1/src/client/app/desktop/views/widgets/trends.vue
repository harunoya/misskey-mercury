<template>
<div class="mkw-trends">
	<ui-container :show-header="!props.compact">
		<template #header><fa icon="fire"/>{{ $t('title') }}</template>
		<template #func><button :title="$t('title')" @click="fetch"><fa icon="sync"/></button></template>

		<div class="mkw-trends--body">
			<p class="fetching" v-if="fetching"><fa icon="spinner" pulse fixed-width/>{{ $t('@.loading') }}<mk-ellipsis/></p>
			<div class="note" v-else-if="note != null">
				<p class="text"><router-link :to="notePage(note)">{{ note.text }}</router-link></p>
				<p class="author">―<router-link :to="userPage(note.user)">@{{ acct(note.user) }}</router-link></p>
			</div>
			<p class="empty" v-else>{{ $t('nothing') }}</p>
		</div>
	</ui-container>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import define from '../../../common/define-widget';
import i18n from '../../../i18n';

export default defineComponent({
	extends: define({
	name: 'trends',
	props: () => ({
		compact: false
	})
}),

	i18n: i18n('desktop/views/widgets/trends.vue'),
	data() {
		return {
			note: null,
			fetching: true,
			offset: 0
		};
	},
	mounted() {
		this.fetch();
	},
	methods: {
		func() {
			this.props.compact = !this.props.compact;
			this.save();
		},
		fetch() {
			this.fetching = true;
			this.note = null;

			this.$root.api('notes/featured', {
				limit: Math.min(this.offset + 1, 100)
			}).then(notes => {
				const note = notes ? notes[this.offset] : null;
				if (note == null) {
					this.offset = 0;
				} else {
					this.offset++;
				}
				this.note = note;
				this.fetching = false;
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.mkw-trends
	.mkw-trends--body
		> .note
			padding 16px
			font-size 12px
			font-style oblique
			color #555

			> p
				margin 0

			> .text,
			> .author
				> a
					color inherit

		> .empty
			margin 0
			padding 16px
			text-align center
			color var(--text)

		> .fetching
			margin 0
			padding 16px
			text-align center
			color var(--text)

			> [data-icon]
				margin-right 4px

</style>
