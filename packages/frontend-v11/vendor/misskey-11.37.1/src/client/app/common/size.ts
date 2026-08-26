import Vue from 'vue';
export default {
	install(Vue) {
		Vue.directive('size', {
			mounted(el, binding) {
				const query = binding.value;
				const width = el.clientWidth;
				for (const q of query) {
					if (q.lt && (width <= q.lt)) {
						el.classList.add(q.class);
					}
					if (q.gt && (width >= q.gt)) {
						el.classList.add(q.class);
					}
				}
			}
		});
	}
};
