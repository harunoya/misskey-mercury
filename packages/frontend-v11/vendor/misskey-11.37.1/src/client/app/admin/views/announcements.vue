<template>
<div>
	<ui-card>
		<template #title><fa :icon="faBroadcastTower"/> {{ $t('announcements') }}</template>
		<section v-for="(announcement, i) in announcements" class="fit-top">
			<ui-input :value="announcement.title" @input="announcement.title = $event" @change="save(announcement)">
				<span>{{ $t('title') }}</span>
			</ui-input>
			<ui-textarea :value="announcement.text" @input="announcement.text = $event">
				<span>{{ $t('text') }}</span>
			</ui-textarea>
			<ui-input :value="announcement.image" @input="announcement.image = $event">
				<span>{{ $t('image-url') }}</span>
			</ui-input>
			<ui-horizon-group class="fit-bottom">
				<ui-button @click="save(announcement)"><fa :icon="['far', 'save']"/> {{ $t('save') }}</ui-button>
				<ui-button @click="remove(i)"><fa :icon="['far', 'trash-alt']"/> {{ $t('remove') }}</ui-button>
			</ui-horizon-group>
		</section>
		<section>
			<ui-button @click="add"><fa :icon="faPlus"/> {{ $t('add') }}</ui-button>
		</section>
	</ui-card>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../i18n';
import { faBroadcastTower, faPlus } from '@fortawesome/free-solid-svg-icons';

export default defineComponent({
	i18n: i18n('admin/views/announcements.vue'),
	data() {
		return {
			announcements: [],
			faBroadcastTower, faPlus
		};
	},

	created() {
		this.$root.api('admin/announcements/list', { limit: 100, status: 'all' }).then(announcements => {
			this.announcements = announcements.map(announcement => ({
				...announcement,
				image: announcement.imageUrl
			}));
		});
	},

	methods: {
		add() {
			this.announcements.unshift({
				title: '',
				text: '',
				image: null,
				icon: 'info',
				display: 'normal',
				forExistingUsers: false,
				silence: false,
				needConfirmationToRead: false,
				isActive: true
			});
		},

		remove(i) {
			this.$root.dialog({
				type: 'warning',
				text: this.$t('_remove.are-you-sure').replace('$1', this.announcements.find((_, j) => j == i).title),
				showCancelButton: true
			}).then(({ canceled }) => {
				if (canceled) return;
				const announcement = this.announcements[i];
				const request = announcement.id
					? this.$root.api('admin/announcements/delete', { id: announcement.id })
					: Promise.resolve();
				request.then(() => {
					this.announcements = this.announcements.filter((_, j) => j !== i);
					this.$root.dialog({
						type: 'success',
						text: this.$t('_remove.removed')
					});
				});
			});
		},

		save(announcement, silent = false) {
			const data = {
				title: announcement.title,
				text: announcement.text,
				imageUrl: announcement.image || null,
				icon: announcement.icon || 'info',
				display: announcement.display || 'normal',
				forExistingUsers: announcement.forExistingUsers === true,
				silence: announcement.silence === true,
				needConfirmationToRead: announcement.needConfirmationToRead === true
			};
			const request = announcement.id
				? this.$root.api('admin/announcements/update', { ...data, id: announcement.id, isActive: announcement.isActive !== false })
				: this.$root.api('admin/announcements/create', data);
			request.then(created => {
				if (!announcement.id && created) Object.assign(announcement, created, { image: created.imageUrl });
				if (!silent) {
					this.$root.dialog({
						type: 'success',
						text: this.$t('saved')
					});
				}
			}).catch(e => {
				this.$root.dialog({
					type: 'error',
					text: e
				});
			});
		}
	}
});
</script>
