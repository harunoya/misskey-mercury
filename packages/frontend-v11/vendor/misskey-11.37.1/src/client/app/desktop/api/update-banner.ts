import { locale } from '../../config';
import ProgressDialog from '../views/components/progress-dialog.vue';
import { uploadDriveFile } from '@compat/upload';

export default ($root: any) => {

	const cropImage = file => new Promise(async (resolve, reject) => {
		const CropWindow = await import('../views/components/crop-window.vue').then(x => x.default);
		const w = $root.new(CropWindow, {
			image: file,
			title: locale['desktop']['banner-crop-title'],
			aspectRatio: 16 / 9
		});

		w.$once('cropped', blob => {
			$root.api('drive/folders/find', {
				name: locale['desktop']['banner']
			}).then(bannerFolder => {
				if (bannerFolder.length === 0) {
					$root.api('drive/folders/create', {
						name: locale['desktop']['banner']
					}).then(iconFolder => {
						resolve(upload(blob, file.name + '.cropped.png', iconFolder));
					});
				} else {
					resolve(upload(blob, file.name + '.cropped.png', bannerFolder[0]));
				}
			});
		});

		w.$once('skipped', () => {
			resolve(file);
		});

		w.$once('cancelled', reject);

		document.body.appendChild(w.$el);
	});

	const upload = (file, name, folder) => new Promise((resolve, reject) => {
		const dialog = $root.new(ProgressDialog, {
			title: locale['desktop']['uploading-banner']
		});
		document.body.appendChild(dialog.$el);

		uploadDriveFile({
			file,
			name,
			folderId: folder?.id ?? null,
			onProgress: (loaded, total) => (dialog as any).update(loaded, total),
		}).then(file => {
			(dialog as any).close();
			resolve(file);
		}).catch(error => {
			(dialog as any).close();
			reject(error);
		});
	});

	const setBanner = file => {
		return $root.api('i/update', {
			bannerId: file.id
		}).then(i => {
			$root.$store.commit('updateIKeyValue', {
				key: 'bannerId',
				value: i.bannerId
			});
			$root.$store.commit('updateIKeyValue', {
				key: 'bannerUrl',
				value: i.bannerUrl
			});

			$root.dialog({
				title: locale['desktop']['banner-updated'],
				text: null
			});

			return i;
		}).catch(err => {
			switch (err.id) {
				case '75aedb19-2afd-4e6d-87fc-67941256fa60':
					$root.dialog({
						type: 'error',
						title: locale['desktop']['unable-to-process'],
						text: locale['desktop']['invalid-filetype']
					});
					break;
				default:
					$root.dialog({
						type: 'error',
						text: locale['desktop']['unable-to-process']
					});
			}
		});
	};

	return (file = null) => {
		const selectedFile = file
			? Promise.resolve(file)
			: $root.$chooseDriveFile({
				multiple: false,
				type: 'image/*',
				title: locale['desktop']['choose-banner']
			});

		return selectedFile
			.then(cropImage)
			.then(setBanner)
			.catch(err => err && console.warn(err));
	};
};
