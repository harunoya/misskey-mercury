<template>
<time class="mk-time" :title="absolute">
	<span v-if=" mode == 'relative' ">{{ relative }}</span>
	<span v-if=" mode == 'absolute' ">{{ absolute }}</span>
	<span v-if=" mode == 'detail' ">{{ absolute }} ({{ relative }})</span>
</time>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../i18n';

export default defineComponent({
	i18n: i18n(),
	props: {
		/**
		 * Nullable, unlike in v11.
		 *
		 * Several of the timestamps this renders are absent in the current API when the thing never
		 * happened — a security key that has never been used, a profile that was never edited. v11
		 * assumed they were always there, so a null crashed the computed and took the whole render
		 * tree with it.
		 */
		time: {
			type: [Date, String],
			required: false,
			default: null
		},
		mode: {
			type: String,
			default: 'relative'
		}
	},
	data() {
		return {
			tickId: null,
			now: new Date()
		};
	},
	computed: {
		_time(): Date | null {
			if (this.time == null) return null;
			const parsed = typeof this.time == 'string' ? new Date(this.time) : this.time;
			return isNaN(parsed.getTime()) ? null : parsed;
		},
		absolute(): string {
			return this._time == null ? '' : this._time.toLocaleString();
		},
		relative(): string {
			const time = this._time;
			if (time == null) return '';
			const ago = (this.now.getTime() - time.getTime()) / 1000/*ms*/;
			return (
				ago >= 31536000 ? this.$t('@.time.years_ago')  .replace('{}', (~~(ago / 31536000)).toString()) :
				ago >= 2592000  ? this.$t('@.time.months_ago') .replace('{}', (~~(ago / 2592000)).toString()) :
				ago >= 604800   ? this.$t('@.time.weeks_ago')  .replace('{}', (~~(ago / 604800)).toString()) :
				ago >= 86400    ? this.$t('@.time.days_ago')   .replace('{}', (~~(ago / 86400)).toString()) :
				ago >= 3600     ? this.$t('@.time.hours_ago')  .replace('{}', (~~(ago / 3600)).toString()) :
				ago >= 60       ? this.$t('@.time.minutes_ago').replace('{}', (~~(ago / 60)).toString()) :
				ago >= 10       ? this.$t('@.time.seconds_ago').replace('{}', (~~(ago % 60)).toString()) :
				ago >= -1       ? this.$t('@.time.just_now') :
				ago <  -1       ? this.$t('@.time.future') :
				this.$t('@.time.unknown'));
		}
	},
	created() {
		if (this.mode == 'relative' || this.mode == 'detail') {
			this.tickId = window.requestAnimationFrame(this.tick);
		}
	},
	unmounted() {
		if (this.mode === 'relative' || this.mode === 'detail') {
			window.clearTimeout(this.tickId);
		}
	},
	methods: {
		tick() {
			this.now = new Date();

			this.tickId = setTimeout(() => {
				window.requestAnimationFrame(this.tick);
			}, 10000);
		}
	}
});
</script>
