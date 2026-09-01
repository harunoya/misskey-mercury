import { createDetachedComponent } from '@compat/detached';
import Particle from '../components/particle.vue';

export default {
	beforeMount(el, binding, vn) {
		if (binding.instance.$store.state.device.reduceMotion) return;

		el.addEventListener('click', () => {
			if (binding.value === false) return;

			const rect = el.getBoundingClientRect();

			const x = rect.left + (el.clientWidth / 2);
			const y = rect.top + (el.clientHeight / 2);

			const particle = createDetachedComponent(Particle, {
					x,
					y
				}).$mount();

			document.body.appendChild(particle.$el);
		});
	}
};
