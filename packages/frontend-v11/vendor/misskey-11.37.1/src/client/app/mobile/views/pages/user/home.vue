<template>
<div class="wojmldye">
	<x-page class="page" v-if="user.pinnedPage" :page="user.pinnedPage" :key="user.pinnedPage.id" :show-title="!user.pinnedPage.hideTitleWhenPinned"/>
	<mk-note-detail class="note" v-for="n in user.pinnedNotes" :key="n.id" :note="n" :compact="true"/>
	<ui-container :body-togglable="true">
		<template #header><fa :icon="['far', 'comments']"/>{{ $t('recent-notes') }}</template>
		<div>
			<x-notes :user="user"/>
		</div>
	</ui-container>
	<ui-container :body-togglable="true">
		<template #header><fa icon="image"/>{{ $t('images') }}</template>
		<div>
			<x-photos :user="user"/>
		</div>
	</ui-container>
	<ui-container :body-togglable="true">
		<template #header><fa icon="chart-bar"/>{{ $t('activity') }}</template>
		<div style="padding:8px;">
			<x-activity :user="user"/>
		</div>
	</ui-container>
</div>
</template>

<script lang="ts">
import { defineAsyncComponent, defineComponent } from 'vue';
import i18n from '../../../../i18n';
import XNotes from './home.notes.vue';
import XPhotos from './home.photos.vue';

export default defineComponent({
	i18n: i18n('mobile/views/pages/user/home.vue'),
	components: {
		XNotes,
		XPhotos,
		XPage: defineAsyncComponent(() => import('../../../../common/views/components/page/page.vue').then(m => m.default)),
		XActivity: defineAsyncComponent(() => import('../../../../common/views/components/activity.vue').then(m => m.default))
	},
	props: ['user'],
	data() {
		return {
			makeFrequentlyRepliedUsersPromise: () => this.$root.api('users/get-frequently-replied-users', {
				userId: this.user.id
			}).then(res => res.map(x => x.user)),
			makeFollowersYouKnowPromise: async () => {
				const followings = await this.$root.api('users/followers', {
					userId: this.user.id,
					limit: 30
				});
				const users = followings.map(following => following.follower);
				if (users.length === 0) return [];
				const relations = await this.$root.api('users/relation', {
					userId: users.map(user => user.id)
				});
				const knownIds = new Set(relations.filter(relation => relation.isFollowing).map(relation => relation.id));
				return users.filter(user => knownIds.has(user.id));
			},
		};
	}
});
</script>

<style lang="stylus" scoped>
.wojmldye
	> .page
		margin 0 0 8px 0

		@media (min-width 500px)
			margin 0 0 16px 0
	
	> .note
		margin 0 0 8px 0

		@media (min-width 500px)
			margin 0 0 16px 0

</style>
