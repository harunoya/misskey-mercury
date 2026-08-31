<template>
<div>
	<ui-container :body-togglable="true">
		<template #header><fa :icon="faUsers"/> {{ $t('owned-groups') }}</template>
		<ui-margin>
			<ui-button @click="add"><fa :icon="faPlus"/> {{ $t('create-group') }}</ui-button>
		</ui-margin>
		<div class="hwgkdrbl" v-for="group in ownedGroups" :key="group.id">
			<ui-hr/>
			<ui-margin>
				<router-link :to="`/i/groups/${group.id}`">{{ group.name }}</router-link>
				<x-avatars :user-ids="group.userIds" style="margin-top:8px;"/>
			</ui-margin>
		</div>
	</ui-container>

	<ui-container :body-togglable="true">
		<template #header><fa :icon="faUsers"/> {{ $t('joined-groups') }}</template>
		<div class="hwgkdrbl" v-for="(group, i) in joinedGroups" :key="group.id">
			<ui-hr v-if="i != 0"/>
			<ui-margin>
				<div style="color:var(--text);">{{ group.name }}</div>
				<x-avatars :user-ids="group.userIds" style="margin-top:8px;"/>
			</ui-margin>
		</div>
	</ui-container>

	<ui-container :body-togglable="true">
		<template #header><fa :icon="faEnvelopeOpenText"/> {{ $t('invites') }}</template>
		<div class="fvlojuur" v-for="(invite, i) in invites" :key="invite.id">
			<ui-hr v-if="i != 0"/>
			<ui-margin>
				<div class="name" style="color:var(--text);">{{ invite.room.name }}</div>
				<x-avatars :user-ids="invite.room.userIds" style="margin-top:8px;"/>
				<ui-horizon-group>
					<ui-button @click="acceptInvite(invite)"><fa :icon="faCheck"/> {{ $t('accept-invite') }}</ui-button>
					<ui-button @click="rejectInvite(invite)"><fa :icon="faBan"/> {{ $t('reject-invite') }}</ui-button>
				</ui-horizon-group>
			</ui-margin>
		</div>
	</ui-container>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { faUsers, faPlus, faCheck, faBan, faEnvelopeOpenText } from '@fortawesome/free-solid-svg-icons';
import i18n from '../../../i18n';
import XAvatars from '../../views/components/avatars.vue';
import { roomsFromMemberships } from '@compat/chat';

export default defineComponent({
	i18n: i18n('common/views/components/user-groups.vue'),
	components: {
		XAvatars
	},
	data() {
		return {
			ownedGroups: [],
			joinedGroups: [],
			invites: [],
			faUsers, faPlus, faCheck, faBan, faEnvelopeOpenText
		};
	},
	mounted() {
		document.title = this.$root.instanceName;

		this.$root.api('chat/rooms/owned', { limit: 100 }).then(async groups => {
			this.ownedGroups = await Promise.all(groups.map(this.withMemberIds));
		});

		this.$root.api('chat/rooms/joining', { limit: 100 }).then(async memberships => {
			this.joinedGroups = await Promise.all(roomsFromMemberships(memberships).map(this.withMemberIds));
		});

		this.$root.api('chat/rooms/invitations/inbox', { limit: 100 }).then(async invites => {
			this.invites = await Promise.all(invites.map(async invite => ({
				...invite,
				room: await this.withMemberIds(invite.room),
			})));
		});

		this.$emit('init', {
			title: this.$t('user-groups'),
			icon: faUsers
		});
	},
	methods: {
		async withMemberIds(room) {
			try {
				const memberships = await this.$root.api('chat/rooms/members', { roomId: room.id, limit: 100 });
				return { ...room, userIds: memberships.map(membership => membership.userId) };
			} catch {
				return { ...room, userIds: room.ownerId ? [room.ownerId] : [] };
			}
		},

		add() {
			this.$root.dialog({
				title: this.$t('group-name'),
				input: true
			}).then(async ({ canceled, result: name }) => {
				if (canceled) return;
				const group = await this.$root.api('chat/rooms/create', {
					name,
					description: ''
				});

				this.ownedGroups.push(await this.withMemberIds(group));
			});
		},
		acceptInvite(invite) {
			this.$root.api('chat/rooms/join', {
				roomId: invite.roomId
			}).then(() => {
				this.$root.dialog({
					type: 'success',
					splash: true
				});
				this.$root.api('chat/rooms/invitations/inbox', { limit: 100 }).then(invites => {
					this.invites = invites;
				}).then(() => {
					this.$root.api('chat/rooms/joining', { limit: 100 }).then(memberships => {
						this.joinedGroups = roomsFromMemberships(memberships);
					});
				});
			});
		},
		rejectInvite(invite) {
			this.$root.api('chat/rooms/invitations/ignore', {
				roomId: invite.roomId
			}).then(() => {
				this.$root.api('chat/rooms/invitations/inbox', { limit: 100 }).then(invites => {
					this.invites = invites;
				});
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.hwgkdrbl
	display block

</style>
