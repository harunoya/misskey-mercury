<template>
<p>ver {{ version }} ({{ codename }})</p>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { version, codename } from '../../../config';
import define from '../../../common/define-widget';
export default defineComponent({
	extends: define({
	name: 'version'
}),

	data() {
		return {
			version,
			codename
		};
	}
});
</script>

<style lang="stylus" scoped>
p
	display block
	margin 0
	padding 0 12px
	text-align center
	font-size 0.7em
	color var(--text)
	opacity 0.8

</style>
