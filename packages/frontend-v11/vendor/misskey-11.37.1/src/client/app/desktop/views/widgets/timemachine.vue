<template>
<div class="mkw-timemachine">
	<mk-calendar :design="props.design" @chosen="chosen"/>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import define from '../../../common/define-widget';
export default defineComponent({
	extends: define({
	name: 'timemachine',
	props: () => ({
		design: 0
	})
}),

	methods: {
		chosen(date) {
			this.$root.$emit('warp', date);
		},
		func() {
			if (this.props.design == 5) {
				this.props.design = 0;
			} else {
				this.props.design++;
			}
			this.save();
		}
	}
});
</script>
