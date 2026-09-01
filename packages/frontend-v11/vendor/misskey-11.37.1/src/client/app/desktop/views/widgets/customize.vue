<template>
<div class="mkw-customize">
	<ui-button @click="customize()">{{ $t('@.customize-home') }}</ui-button>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import define from '../../../common/define-widget';
import i18n from '../../../i18n';

export default defineComponent({
	extends: define({
	name: 'customize',
}),

	i18n: i18n(),
	methods: {
		customize(date) {
			location.href = '/?customize';
		}
	}
});
</script>
