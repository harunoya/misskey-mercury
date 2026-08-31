import { locale } from '../../config';
import ProgressDialog from '../views/components/progress-dialog.vue';
import { uploadDriveFile } from '@compat/upload';

export default ($root: any) => {

	const cropImage = file => new Promise(async (resolve, reject) => {
		const CropWindow = await import('../views/components/crop-window.vue').then(x => x.default);
		const w = $root.new(CropWindow, {
			image: file,
			title: locale['desktop']['avatar-crop-title'],
			aspectRatio: 1 / 1
		});

		w.$once('cropped', blob => {
			$root.api('drive/folders/find', {
				name: locale['desktop']['avatar']
			}).then(avatarFolder => {
				if (avatarFolder.length === 0) {
					$root.api('drive/folders/create', {
						name: locale['desktop']['avatar']
					}).then(iconFolder => {
						resolve(upload(blob, file.name + '.cropped.png', iconFolder));
					});
				} else {
					resolve(upload(blob, file.name + '.cropped.png', avatarFolder[0]));
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
			title: locale['desktop']['uploading-avatar']
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

	const setAvatar = file => {
		return $root.api('i/update', {
			avatarId: file.id
		}).then(i => {
			$root.$store.commit('updateIKeyValue', {
				key: 'avatarId',
				value: i.avatarId
			});
			$root.$store.commit('updateIKeyValue', {
				key: 'avatarUrl',
				value: i.avatarUrl
			});

			$root.dialog({
				title: locale['desktop']['avatar-updated'],
				text: null
			});

			return i;
		}).catch(err => {
			switch (err.id) {
				case 'f419f9f8-2f4d-46b1-9fb4-49d3a2fd7191':
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
				title: locale['desktop']['choose-avatar']
			});

		return selectedFile
			.then(cropImage)
			.then(setAvatar)
			.catch(err => err && console.warn(err));
	};
};
