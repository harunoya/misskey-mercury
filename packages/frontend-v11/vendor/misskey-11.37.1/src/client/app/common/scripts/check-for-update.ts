export default async function($root: any, force = false, silent = false) {
	const meta = await $root.getMeta(force);
	const newer = typeof meta.version === 'string' ? meta.version : null;
	const current = localStorage.getItem('server-version');
	if (newer != null) localStorage.setItem('server-version', newer);
	return current != null && newer != null && newer !== current ? newer : null;
}
