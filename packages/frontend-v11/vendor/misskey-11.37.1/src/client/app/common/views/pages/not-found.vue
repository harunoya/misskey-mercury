<template>
<figure class="megtcxgu">
	<img :src="src" alt="">
	<figcaption>
		<h1><span>Not found</span></h1>
		<p><span>{{ $t('page-not-found') }}</span></p>
	</figcaption>
</figure>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../i18n';

/**
 * Where an address that v11 has no route for should send the reader instead.
 *
 * v11 is reached from the current client, which keeps its own URLs — and the two clients do not
 * agree on them. Following a link, or switching UI while on `/settings`, therefore lands on this
 * page rather than on the page the reader asked for. Most of those addresses do have a v11
 * equivalent, so the ones that do are named here and the reader is offered the move.
 *
 * Ordered: the first pattern that matches wins, so more specific prefixes come first.
 */
const destinations: { test: RegExp; to: string | ((path: string) => string); label: string }[] = [
	{ test: /^\/settings(\/|$)/, to: '/i/settings', label: 'settings' },
	{ test: /^\/my\/drive(\/|$)/, to: '/i/drive', label: 'drive' },
	{ test: /^\/my\/favorites(\/|$)/, to: '/i/favorites', label: 'favorites' },
	{ test: /^\/my\/lists(\/|$)/, to: '/i/lists', label: 'lists' },
	{ test: /^\/my\/pages(\/|$)/, to: '/i/pages', label: 'pages' },
	{ test: /^\/my\/groups(\/|$)/, to: '/i/groups', label: 'groups' },
	{ test: /^\/my\/follow-requests(\/|$)/, to: '/i/follow-requests', label: 'followRequests' },
	// The current client nests these under `/my/`; v11 keeps them directly under `/i/`.
	{ test: /^\/my(\/|$)/, to: '/i/settings', label: 'settings' },
	{ test: /^\/timeline(\/|$)/, to: '/', label: 'home' },
	{ test: /^\/explore(\/|$)/, to: '/explore', label: 'explore' },
];

/** Addresses the current client owns that v11 has nothing comparable for. */
const HOME = { to: '/', label: 'home' };

export function resolveDestination(path: string): { to: string; label: string } {
	for (const candidate of destinations) {
		if (!candidate.test.test(path)) continue;
		const to = typeof candidate.to === 'function' ? candidate.to(path) : candidate.to;
		// A rule that would send the reader back where they already are is no help.
		if (to !== path) return { to, label: candidate.label };
	}
	return HOME;
}

export default defineComponent({
	i18n: i18n('common/views/pages/not-found.vue'),
	data() {
		return {
			src: '',
			asked: false,
		}
	},
	created() {
		this.$root.getMeta().then(meta => {
			if (meta.errorImageUrl)
				this.src = meta.errorImageUrl;
		});
	},
	mounted() {
		this.offerRedirect();
	},
	methods: {
		async offerRedirect() {
			// Guarded: the router can re-enter this page while the dialog is open, and a second
			// dialog stacked on the first cannot be dismissed.
			if (this.asked) return;
			this.asked = true;

			const path = this.$route.fullPath;
			const { to, label } = resolveDestination(path);
			const destination = this.$t(`_destinations.${label}`);
			// A path that has a real counterpart is a UI mismatch rather than a dead link, and saying
			// so is the difference between "this is broken" and "you are in the other client".
			const moved = to !== '/' || /^\/(settings|my|timeline)(\/|$)/.test(path);

			const { canceled } = await this.$root.dialog({
				type: moved ? 'info' : 'warning',
				title: moved ? this.$t('moved-title') : null,
				text: this.$t(moved ? 'moved-text' : 'not-found-text', { path, destination }),
				showCancelButton: true,
			});
			if (canceled) return;

			this.$router.replace(to);
		},
	},
})
</script>

<style lang="stylus" scoped>
.megtcxgu
	align-items center
	bottom 0
	display flex
	justify-content center
	left 0
	margin auto
	position fixed
	right 0
	top 0

	> img
		width 500px

	> figcaption
		margin 8px

		h1,
		p
			color var(--text)
			display flex
			flex-flow column

			*
				position relative
				width 100%

	@media (max-width: 767px)
		flex-flow column

		> figcaption
			text-align center

</style>
