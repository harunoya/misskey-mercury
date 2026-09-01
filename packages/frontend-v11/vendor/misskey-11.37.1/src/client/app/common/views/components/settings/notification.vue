<!--
API_COMPAT: this card used to carry three more controls. All three are gone from the current
backend, and none of them fails in a way the reader can see:

- "auto watch" wrote `autoWatch` through `i/update`. Note watching was removed, `i/update` ignores
  the unknown property and still answers 200, and `/api/i` no longer returns `autoWatch` — so the
  switch reported success, then sprang back on the next load.
- "mark all unread notes as read" called `i/read_all_unread_notes` (404, no replacement).
- "mark all talk messages as read" called `i/read_all_messaging_messages` (404; messaging was
  replaced by chat, which tracks its own unread state).

They are removed rather than rewired because there is nothing left to rewire them to.
-->
<template>
<ui-card>
	<template #title><fa :icon="['far', 'bell']"/> {{ $t('title') }}</template>
	<section>
		<section>
			<ui-button @click="readAllNotifications">{{ $t('mark-as-read-all-notifications') }}</ui-button>
		</section>
	</section>
</ui-card>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../../i18n';

export default defineComponent({
	i18n: i18n('common/views/components/notification-settings.vue'),

	methods: {
		readAllNotifications() {
			this.$root.api('notifications/mark-all-as-read');
		}
	}
});
</script>
