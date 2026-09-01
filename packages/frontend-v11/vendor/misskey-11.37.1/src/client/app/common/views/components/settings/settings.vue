<template>
<div class="nqfhvmnl">
	<template v-if="page == null || page == 'profile'">
		<x-profile/>
		<x-integration/>
	</template>

	<template v-if="page == null || page == 'appearance'">
		<x-theme/>

		<ui-card>
			<template #title><fa icon="desktop"/> {{ $t('@._settings.appearance') }}</template>

			<section v-if="!$root.isMobile">
				<ui-switch :value="showPostFormOnTopOfTl" @change="showPostFormOnTopOfTl = $event">{{ $t('@._settings.post-form-on-timeline') }}</ui-switch>
				<ui-button @click="customizeHome">{{ $t('@.customize-home') }}</ui-button>
			</section>
			<section v-if="!$root.isMobile">
				<header>{{ $t('@._settings.wallpaper') }}</header>
				<ui-horizon-group class="fit-bottom">
					<ui-button @click="updateWallpaper">{{ $t('@._settings.choose-wallpaper') }}</ui-button>
					<ui-button @click="deleteWallpaper">{{ $t('@._settings.delete-wallpaper') }}</ui-button>
				</ui-horizon-group>
			</section>
			<section v-if="!$root.isMobile">
				<header>{{ $t('@._settings.navbar-position') }}</header>
				<ui-radio :model="navbar" @change="navbar = $event" value="top">{{ $t('@._settings.navbar-position-top') }}</ui-radio>
				<ui-radio :model="navbar" @change="navbar = $event" value="left">{{ $t('@._settings.navbar-position-left') }}</ui-radio>
				<ui-radio :model="navbar" @change="navbar = $event" value="right">{{ $t('@._settings.navbar-position-right') }}</ui-radio>
			</section>
			<section>
				<ui-switch :value="useShadow" @change="useShadow = $event">{{ $t('@._settings.use-shadow') }}</ui-switch>
				<ui-switch :value="roundedCorners" @change="roundedCorners = $event">{{ $t('@._settings.rounded-corners') }}</ui-switch>
				<ui-switch :value="circleIcons" @change="circleIcons = $event">{{ $t('@._settings.circle-icons') }}</ui-switch>
				<ui-switch :value="reduceMotion" @change="reduceMotion = $event">{{ $t('@._settings.reduce-motion') }}</ui-switch>
				<ui-switch :value="contrastedAcct" @change="contrastedAcct = $event">{{ $t('@._settings.contrasted-acct') }}</ui-switch>
				<ui-switch :value="showFullAcct" @change="showFullAcct = $event">{{ $t('@._settings.show-full-acct') }}</ui-switch>
				<ui-switch :value="showVia" @change="showVia = $event">{{ $t('@._settings.show-via') }}</ui-switch>
				<ui-switch :value="useOsDefaultEmojis" @change="useOsDefaultEmojis = $event">{{ $t('@._settings.use-os-default-emojis') }}</ui-switch>
				<ui-switch :value="iLikeSushi" @change="iLikeSushi = $event">{{ $t('@._settings.i-like-sushi') }}</ui-switch>
			</section>
			<section>
				<ui-switch :value="suggestRecentHashtags" @change="suggestRecentHashtags = $event">{{ $t('@._settings.suggest-recent-hashtags') }}</ui-switch>
				<ui-switch :value="showClockOnHeader" @change="showClockOnHeader = $event" v-if="!$root.isMobile">{{ $t('@._settings.show-clock-on-header') }}</ui-switch>
				<ui-switch :value="alwaysShowNsfw" @change="alwaysShowNsfw = $event">{{ $t('@._settings.always-show-nsfw') }}</ui-switch>
				<ui-switch :value="showReplyTarget" @change="showReplyTarget = $event">{{ $t('@._settings.show-reply-target') }}</ui-switch>
				<ui-switch :value="disableAnimatedMfm" @change="disableAnimatedMfm = $event">{{ $t('@._settings.disable-animated-mfm') }}</ui-switch>
				<ui-switch :value="disableShowingAnimatedImages" @change="disableShowingAnimatedImages = $event">{{ $t('@._settings.disable-showing-animated-images') }}</ui-switch>
				<ui-switch :value="remainDeletedNote" @change="remainDeletedNote = $event">{{ $t('@._settings.remain-deleted-note') }}</ui-switch>
				<ui-switch :value="enableMobileQuickNotificationView" @change="enableMobileQuickNotificationView = $event">{{ $t('@._settings.enable-quick-notification-view') }}</ui-switch>
			</section>
			<section>
				<header>{{ $t('@._settings.line-width') }}</header>
				<ui-radio :model="lineWidth" @change="lineWidth = $event" :value="0.5">{{ $t('@._settings.line-width-thin') }}</ui-radio>
				<ui-radio :model="lineWidth" @change="lineWidth = $event" :value="1">{{ $t('@._settings.line-width-normal') }}</ui-radio>
				<ui-radio :model="lineWidth" @change="lineWidth = $event" :value="2">{{ $t('@._settings.line-width-thick') }}</ui-radio>
			</section>
			<section>
				<header>{{ $t('@._settings.font-size') }}</header>
				<ui-radio :model="fontSize" @change="fontSize = $event" :value="-2">{{ $t('@._settings.font-size-x-small') }}</ui-radio>
				<ui-radio :model="fontSize" @change="fontSize = $event" :value="-1">{{ $t('@._settings.font-size-small') }}</ui-radio>
				<ui-radio :model="fontSize" @change="fontSize = $event" :value="0">{{ $t('@._settings.font-size-medium') }}</ui-radio>
				<ui-radio :model="fontSize" @change="fontSize = $event" :value="1">{{ $t('@._settings.font-size-large') }}</ui-radio>
				<ui-radio :model="fontSize" @change="fontSize = $event" :value="2">{{ $t('@._settings.font-size-x-large') }}</ui-radio>
			</section>
			<section v-if="$root.isMobile">
				<header>{{ $t('@._settings.post-style') }}</header>
				<ui-radio :model="postStyle" @change="postStyle = $event" value="standard">{{ $t('@._settings.post-style-standard') }}</ui-radio>
				<ui-radio :model="postStyle" @change="postStyle = $event" value="smart">{{ $t('@._settings.post-style-smart') }}</ui-radio>
			</section>
			<section v-if="$root.isMobile">
				<header>{{ $t('@._settings.notification-position') }}</header>
				<ui-radio :model="mobileNotificationPosition" @change="mobileNotificationPosition = $event" value="bottom">{{ $t('@._settings.notification-position-bottom') }}</ui-radio>
				<ui-radio :model="mobileNotificationPosition" @change="mobileNotificationPosition = $event" value="top">{{ $t('@._settings.notification-position-top') }}</ui-radio>
			</section>
			<section>
				<header>{{ $t('@._settings.deck-column-align') }}</header>
				<ui-radio :model="deckColumnAlign" @change="deckColumnAlign = $event" value="center">{{ $t('@._settings.deck-column-align-center') }}</ui-radio>
				<ui-radio :model="deckColumnAlign" @change="deckColumnAlign = $event" value="left">{{ $t('@._settings.deck-column-align-left') }}</ui-radio>
				<ui-radio :model="deckColumnAlign" @change="deckColumnAlign = $event" value="flexible">{{ $t('@._settings.deck-column-align-flexible') }}</ui-radio>
			</section>
			<section>
				<header>{{ $t('@._settings.deck-column-width') }}</header>
				<ui-radio :model="deckColumnWidth" @change="deckColumnWidth = $event" value="narrow">{{ $t('@._settings.deck-column-width-narrow') }}</ui-radio>
				<ui-radio :model="deckColumnWidth" @change="deckColumnWidth = $event" value="narrower">{{ $t('@._settings.deck-column-width-narrower') }}</ui-radio>
				<ui-radio :model="deckColumnWidth" @change="deckColumnWidth = $event" value="normal">{{ $t('@._settings.deck-column-width-normal') }}</ui-radio>
				<ui-radio :model="deckColumnWidth" @change="deckColumnWidth = $event" value="wider">{{ $t('@._settings.deck-column-width-wider') }}</ui-radio>
				<ui-radio :model="deckColumnWidth" @change="deckColumnWidth = $event" value="wide">{{ $t('@._settings.deck-column-width-wide') }}</ui-radio>
			</section>
			<section>
				<ui-switch :value="games_reversi_showBoardLabels" @change="games_reversi_showBoardLabels = $event">{{ $t('@._settings.show-reversi-board-labels') }}</ui-switch>
				<ui-switch :value="games_reversi_useAvatarStones" @change="games_reversi_useAvatarStones = $event">{{ $t('@._settings.use-avatar-reversi-stones') }}</ui-switch>
			</section>
		</ui-card>
	</template>

	<template v-if="page == null || page == 'behavior'">
		<ui-card>
			<template #title><fa icon="sliders-h"/> {{ $t('@._settings.behavior') }}</template>

			<section>
				<ui-switch :value="fetchOnScroll" @change="fetchOnScroll = $event">{{ $t('@._settings.fetch-on-scroll') }}
					<template #desc>{{ $t('@._settings.fetch-on-scroll-desc') }}</template>
				</ui-switch>
				<ui-switch :value="keepCw" @change="keepCw = $event">{{ $t('@._settings.keep-cw') }}
					<template #desc>{{ $t('@._settings.keep-cw-desc') }}</template>
				</ui-switch>
				<ui-switch v-if="$root.isMobile" :value="disableViaMobile" @change="disableViaMobile = $event">{{ $t('@._settings.disable-via-mobile') }}</ui-switch>
			</section>

			<section>
				<header>{{ $t('@._settings.reactions') }}</header>
				<ui-textarea :value="reactions" @input="reactions = $event">
					{{ $t('@._settings.reactions') }}<template #desc>{{ $t('@._settings.reactions-description') }}</template>
				</ui-textarea>
				<ui-horizon-group>
					<ui-button @click="save('reactions', reactions.trim().split('\n'))" primary><fa :icon="faSave"/> {{ $t('@._settings.save') }}</ui-button>
					<ui-button @click="previewReaction()" ref="reactionsPreviewButton"><fa :icon="faEye"/> {{ $t('@._settings.preview') }}</ui-button>
				</ui-horizon-group>
			</section>

			<section>
				<header>{{ $t('@._settings.timeline') }}</header>
				<ui-switch :value="showMyRenotes" @change="showMyRenotes = $event">{{ $t('@._settings.show-my-renotes') }}</ui-switch>
				<ui-switch :value="showRenotedMyNotes" @change="showRenotedMyNotes = $event">{{ $t('@._settings.show-renoted-my-notes') }}</ui-switch>
				<ui-switch :value="showLocalRenotes" @change="showLocalRenotes = $event">{{ $t('@._settings.show-local-renotes') }}</ui-switch>
			</section>

			<section>
				<header>{{ $t('@._settings.note-visibility') }}</header>
				<ui-switch :value="rememberNoteVisibility" @change="rememberNoteVisibility = $event">{{ $t('@._settings.remember-note-visibility') }}</ui-switch>
				<section>
					<header>{{ $t('@._settings.default-note-visibility') }}</header>
					<ui-select :value="defaultNoteVisibility" @input="defaultNoteVisibility = $event">
						<option value="public">{{ $t('@.note-visibility.public') }}</option>
						<option value="home">{{ $t('@.note-visibility.home') }}</option>
						<option value="followers">{{ $t('@.note-visibility.followers') }}</option>
						<option value="specified">{{ $t('@.note-visibility.specified') }}</option>
						<option value="local-public">{{ $t('@.note-visibility.local-public') }}</option>
						<option value="local-home">{{ $t('@.note-visibility.local-home') }}</option>
						<option value="local-followers">{{ $t('@.note-visibility.local-followers') }}</option>
					</ui-select>
				</section>
			</section>

			<section>
				<header>{{ $t('@._settings.sync') }}</header>
				<ui-input v-if="$root.isMobile" :value="mobileHomeProfile" @input="mobileHomeProfile = $event" :datalist="Object.keys($store.state.settings.mobileHomeProfiles)">{{ $t('@._settings.home-profile') }}</ui-input>
				<ui-input v-else :value="homeProfile" @input="homeProfile = $event" :datalist="Object.keys($store.state.settings.homeProfiles)">{{ $t('@._settings.home-profile') }}</ui-input>
				<ui-input :value="deckProfile" @input="deckProfile = $event" :datalist="Object.keys($store.state.settings.deckProfiles)">{{ $t('@._settings.deck-profile') }}</ui-input>
			</section>

			<section>
				<header>{{ $t('@._settings.web-search-engine') }}</header>
				<ui-input :value="webSearchEngine" @input="webSearchEngine = $event">{{ $t('@._settings.web-search-engine') }}
					<template #desc>{{ $t('@._settings.web-search-engine-desc') }}</template>
				</ui-input>
				<ui-button @click="save('webSearchEngine', webSearchEngine)"><fa :icon="faSave"/> {{ $t('@._settings.save') }}</ui-button>
			</section>

			<section v-if="!$root.isMobile">
				<header>{{ $t('@._settings.paste') }}</header>
				<ui-input :value="pastedFileName" @input="pastedFileName = $event">{{ $t('@._settings.pasted-file-name') }}
					<template v-if="pastedFileName === this.$store.state.settings.pastedFileName" #desc>{{ $t('@._settings.pasted-file-name-desc') }}</template>
					<template v-else #desc>{{ pastedFileNamePreview() }}</template>
				</ui-input>
				<ui-button @click="save('pastedFileName', pastedFileName)"><fa :icon="faSave"/> {{ $t('@._settings.save') }}</ui-button>

				<ui-switch :value="pasteDialog" @change="pasteDialog = $event">{{ $t('@._settings.paste-dialog') }}
					<template #desc>{{ $t('@._settings.paste-dialog-desc') }}</template>
				</ui-switch>
			</section>

			<section>
			</section>
		</ui-card>

		<ui-card>
			<template #title><fa icon="volume-up"/> {{ $t('@._settings.sound') }}</template>

			<section>
				<ui-switch :value="enableSounds" @change="enableSounds = $event">{{ $t('@._settings.enable-sounds') }}
					<template #desc>{{ $t('@._settings.enable-sounds-desc') }}</template>
				</ui-switch>
				<label>{{ $t('@._settings.volume') }}</label>
				<input type="range"
					v-model="soundVolume"
					:disabled="!enableSounds"
					max="1"
					step="0.1"
				/>
				<ui-button @click="soundTest"><fa icon="volume-up"/> {{ $t('@._settings.test') }}</ui-button>
			</section>
		</ui-card>

		<x-language/>
		<x-app-type/>
	</template>

	<template v-if="page == null || page == 'notification'">
		<x-notification/>
	</template>

	<template v-if="page == null || page == 'drive'">
		<x-drive/>
	</template>

	<template v-if="page == null || page == 'hashtags'">
		<ui-card>
			<template #title><fa icon="hashtag"/> {{ $t('@._settings.tags') }}</template>
			<section>
				<x-tags/>
			</section>
		</ui-card>
	</template>

	<template v-if="page == null || page == 'muteAndBlock'">
		<x-mute-and-block/>
	</template>

	<!--
	<template v-if="page == null || page == 'apps'">
		<ui-card>
			<template #title><fa icon="puzzle-piece"/> {{ $t('@._settings.apps') }}</template>
			<section>
				<x-apps/>
			</section>
		</ui-card>
	</template>
	-->

	<template v-if="page == null || page == 'security'">
		<ui-card>
			<template #title><fa icon="unlock-alt"/> {{ $t('@._settings.password') }}</template>
			<section>
				<x-password/>
			</section>
		</ui-card>

		<ui-card v-if="!$root.isMobile">
			<template #title><fa icon="mobile-alt"/> {{ $t('@.2fa') }}</template>
			<section>
				<x-2fa/>
			</section>
		</ui-card>

		<!--
		<ui-card>
			<template #title><fa icon="sign-in-alt"/> {{ $t('@._settings.signin') }}</template>
			<section>
				<x-signins/>
			</section>
		</ui-card>
		-->
	</template>

	<template v-if="page == null || page == 'api'">
		<x-api/>
	</template>

	<template v-if="page == null || page == 'other'">
		<ui-card>
			<template #title><fa icon="sync-alt"/> {{ $t('@._settings.update') }}</template>
			<section>
				<p>
					<span>{{ $t('@._settings.version') }} <i>{{ version }}</i></span>
					<template v-if="latestVersion !== undefined">
						<br>
						<span>{{ $t('@._settings.latest-version') }} <i>{{ latestVersion ? latestVersion : version }}</i></span>
					</template>
				</p>
				<ui-button @click="checkForUpdate" :disabled="checkingForUpdate">
					<template v-if="checkingForUpdate">{{ $t('@._settings.update-checking') }}<mk-ellipsis/></template>
					<template v-else>{{ $t('@._settings.do-update') }}</template>
				</ui-button>
			</section>
		</ui-card>

		<ui-card>
			<template #title><fa icon="cogs"/> {{ $t('@._settings.advanced-settings') }}</template>
			<section>
				<ui-switch :value="debug" @change="debug = $event">
					{{ $t('@._settings.debug-mode') }}<template #desc>{{ $t('@._settings.debug-mode-desc') }}</template>
				</ui-switch>
			</section>
		</ui-card>
	</template>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import i18n from '../../../../i18n';
import X2fa from './2fa.vue';
import XApps from './apps.vue';
import XSignins from './signins.vue';
import XTags from './tags.vue';
import XIntegration from './integration.vue';
import XTheme from './theme.vue';
import XDrive from './drive.vue';
import XMuteAndBlock from './mute-and-block.vue';
import XPassword from './password.vue';
import XProfile from './profile.vue';
import XApi from './api.vue';
import XLanguage from './language.vue';
import XAppType from './app-type.vue';
import XNotification from './notification.vue';
import MkReactionPicker from '../reaction-picker.vue';

import { url, version } from '../../../../config';
import checkForUpdate from '../../../scripts/check-for-update';
import { formatTimeString } from '../../../../../../misc/format-time-string';
import { faSave, faEye } from '@fortawesome/free-regular-svg-icons';

export default defineComponent({
	i18n: i18n(),
	components: {
		X2fa,
		XApps,
		XSignins,
		XTags,
		XIntegration,
		XTheme,
		XDrive,
		XMuteAndBlock,
		XPassword,
		XProfile,
		XApi,
		XLanguage,
		XAppType,
		XNotification,
	},
	props: {
		page: {
			type: String,
			required: false,
			default: null
		}
	},
	data() {
		return {
			meta: null,
			version,
			reactions: this.$store.state.settings.reactions.join('\n'),
			webSearchEngine: this.$store.state.settings.webSearchEngine,
			pastedFileName : this.$store.state.settings.pastedFileName,
			latestVersion: undefined,
			checkingForUpdate: false,
			faSave, faEye
		};
	},
	computed: {
		useOsDefaultEmojis: {
			get() { return this.$store.state.device.useOsDefaultEmojis; },
			set(value) { this.$store.commit('device/set', { key: 'useOsDefaultEmojis', value }); }
		},

		reduceMotion: {
			get() { return this.$store.state.device.reduceMotion; },
			set(value) { this.$store.commit('device/set', { key: 'reduceMotion', value }); }
		},

		keepCw: {
			get() { return this.$store.state.settings.keepCw; },
			set(value) { this.$store.commit('settings/set', { key: 'keepCw', value }); }
		},

		navbar: {
			get() { return this.$store.state.device.navbar; },
			set(value) { this.$store.commit('device/set', { key: 'navbar', value }); }
		},

		deckColumnAlign: {
			get() { return this.$store.state.device.deckColumnAlign; },
			set(value) { this.$store.commit('device/set', { key: 'deckColumnAlign', value }); }
		},

		deckColumnWidth: {
			get() { return this.$store.state.device.deckColumnWidth; },
			set(value) { this.$store.commit('device/set', { key: 'deckColumnWidth', value }); }
		},

		enableSounds: {
			get() { return this.$store.state.device.enableSounds; },
			set(value) { this.$store.commit('device/set', { key: 'enableSounds', value }); }
		},

		soundVolume: {
			get() { return this.$store.state.device.soundVolume; },
			set(value) { this.$store.commit('device/set', { key: 'soundVolume', value }); }
		},

		debug: {
			get() { return this.$store.state.device.debug; },
			set(value) { this.$store.commit('device/set', { key: 'debug', value }); }
		},

		alwaysShowNsfw: {
			get() { return this.$store.state.device.alwaysShowNsfw; },
			set(value) { this.$store.commit('device/set', { key: 'alwaysShowNsfw', value }); }
		},

		postStyle: {
			get() { return this.$store.state.device.postStyle; },
			set(value) { this.$store.commit('device/set', { key: 'postStyle', value }); }
		},

		disableViaMobile: {
			get() { return this.$store.state.settings.disableViaMobile; },
			set(value) { this.$store.dispatch('settings/set', { key: 'disableViaMobile', value }); }
		},

		useShadow: {
			get() { return this.$store.state.device.useShadow; },
			set(value) { this.$store.commit('device/set', { key: 'useShadow', value }); }
		},

		roundedCorners: {
			get() { return this.$store.state.device.roundedCorners; },
			set(value) { this.$store.commit('device/set', { key: 'roundedCorners', value }); }
		},

		lineWidth: {
			get() { return this.$store.state.device.lineWidth; },
			set(value) { this.$store.commit('device/set', { key: 'lineWidth', value }); }
		},

		fontSize: {
			get() { return this.$store.state.device.fontSize; },
			set(value) { this.$store.commit('device/set', { key: 'fontSize', value }); }
		},

		fetchOnScroll: {
			get() { return this.$store.state.settings.fetchOnScroll; },
			set(value) { this.$store.dispatch('settings/set', { key: 'fetchOnScroll', value }); }
		},

		rememberNoteVisibility: {
			get() { return this.$store.state.settings.rememberNoteVisibility; },
			set(value) { this.$store.dispatch('settings/set', { key: 'rememberNoteVisibility', value }); }
		},

		defaultNoteVisibility: {
			get() { return this.$store.state.settings.defaultNoteVisibility; },
			set(value) { this.$store.dispatch('settings/set', { key: 'defaultNoteVisibility', value }); }
		},

		pasteDialog: {
			get() { return this.$store.state.settings.pasteDialog; },
			set(value) { this.$store.dispatch('settings/set', { key: 'pasteDialog', value }); }
		},

		showReplyTarget: {
			get() { return this.$store.state.settings.showReplyTarget; },
			set(value) { this.$store.dispatch('settings/set', { key: 'showReplyTarget', value }); }
		},

		showMyRenotes: {
			get() { return this.$store.state.settings.showMyRenotes; },
			set(value) { this.$store.dispatch('settings/set', { key: 'showMyRenotes', value }); }
		},

		showRenotedMyNotes: {
			get() { return this.$store.state.settings.showRenotedMyNotes; },
			set(value) { this.$store.dispatch('settings/set', { key: 'showRenotedMyNotes', value }); }
		},

		showLocalRenotes: {
			get() { return this.$store.state.settings.showLocalRenotes; },
			set(value) { this.$store.dispatch('settings/set', { key: 'showLocalRenotes', value }); }
		},

		showPostFormOnTopOfTl: {
			get() { return this.$store.state.settings.showPostFormOnTopOfTl; },
			set(value) { this.$store.dispatch('settings/set', { key: 'showPostFormOnTopOfTl', value }); }
		},

		suggestRecentHashtags: {
			get() { return this.$store.state.settings.suggestRecentHashtags; },
			set(value) { this.$store.dispatch('settings/set', { key: 'suggestRecentHashtags', value }); }
		},

		showClockOnHeader: {
			get() { return this.$store.state.settings.showClockOnHeader; },
			set(value) { this.$store.dispatch('settings/set', { key: 'showClockOnHeader', value }); }
		},

		circleIcons: {
			get() { return this.$store.state.settings.circleIcons; },
			set(value) {
				this.$store.dispatch('settings/set', { key: 'circleIcons', value });
				this.reload();
			}
		},

		contrastedAcct: {
			get() { return this.$store.state.settings.contrastedAcct; },
			set(value) {
				this.$store.dispatch('settings/set', { key: 'contrastedAcct', value });
				this.reload();
			}
		},

		showFullAcct: {
			get() { return this.$store.state.settings.showFullAcct; },
			set(value) {
				this.$store.dispatch('settings/set', { key: 'showFullAcct', value });
				this.reload();
			}
		},

		showVia: {
			get() { return this.$store.state.settings.showVia; },
			set(value) { this.$store.dispatch('settings/set', { key: 'showVia', value }); }
		},

		iLikeSushi: {
			get() { return this.$store.state.settings.iLikeSushi; },
			set(value) { this.$store.dispatch('settings/set', { key: 'iLikeSushi', value }); }
		},

		games_reversi_showBoardLabels: {
			get() { return this.$store.state.settings.gamesReversiShowBoardLabels; },
			set(value) { this.$store.dispatch('settings/set', { key: 'gamesReversiShowBoardLabels', value }); }
		},

		games_reversi_useAvatarStones: {
			get() { return this.$store.state.settings.gamesReversiUseAvatarStones; },
			set(value) { this.$store.dispatch('settings/set', { key: 'gamesReversiUseAvatarStones', value }); }
		},

		disableAnimatedMfm: {
			get() { return this.$store.state.settings.disableAnimatedMfm; },
			set(value) { this.$store.dispatch('settings/set', { key: 'disableAnimatedMfm', value }); }
		},

		disableShowingAnimatedImages: {
			get() { return this.$store.state.device.disableShowingAnimatedImages; },
			set(value) { this.$store.commit('device/set', { key: 'disableShowingAnimatedImages', value }); }
		},

		remainDeletedNote: {
			get() { return this.$store.state.settings.remainDeletedNote; },
			set(value) { this.$store.dispatch('settings/set', { key: 'remainDeletedNote', value }); }
		},

		mobileNotificationPosition: {
			get() { return this.$store.state.device.mobileNotificationPosition; },
			set(value) { this.$store.commit('device/set', { key: 'mobileNotificationPosition', value }); }
		},

		enableMobileQuickNotificationView: {
			get() { return this.$store.state.device.enableMobileQuickNotificationView; },
			set(value) { this.$store.commit('device/set', { key: 'enableMobileQuickNotificationView', value }); }
		},

		homeProfile: {
			get() { return this.$store.state.device.homeProfile; },
			set(value) { this.$store.commit('device/set', { key: 'homeProfile', value }); }
		},

		mobileHomeProfile: {
			get() { return this.$store.state.device.mobileHomeProfile; },
			set(value) { this.$store.commit('device/set', { key: 'mobileHomeProfile', value }); }
		},

		deckProfile: {
			get() { return this.$store.state.device.deckProfile; },
			set(value) { this.$store.commit('device/set', { key: 'deckProfile', value }); }
		},
	},
	created() {
		this.$root.getMeta().then(meta => {
			this.meta = meta;
		});
	},
	methods: {
		reload() {
			this.$root.dialog({
				type: 'warning',
				text: this.$t('@.reload-to-apply-the-setting'),
				showCancelButton: true
			}).then(({ canceled }) => {
				if (!canceled) {
					location.reload();
				}
			});
		},
		save(key, value) {
			this.$store.dispatch('settings/set', {
				key,
				value
			}).then(() => {
				this.$root.dialog({
					type: 'success',
					text: this.$t('@._settings.saved')
				})
			});
		},
		customizeHome() {
			location.href = '/?customize';
		},
		updateWallpaper() {
			this.$chooseDriveFile({
				multiple: false
			}).then(file => {
				this.$store.dispatch('settings/set', { key: 'wallpaper', value: file.url });
			});
		},
		deleteWallpaper() {
			this.$store.dispatch('settings/set', { key: 'wallpaper', value: null });
		},
		checkForUpdate() {
			this.checkingForUpdate = true;
			checkForUpdate(this.$root, true, true).then(newer => {
				this.checkingForUpdate = false;
				this.latestVersion = newer;
				if (newer == null) {
					this.$root.dialog({
						title: this.$t('@._settings.no-updates'),
						text: this.$t('@._settings.no-updates-desc')
					});
				} else {
					this.$root.dialog({
						title: this.$t('@._settings.update-available'),
						text: this.$t('@._settings.update-available-desc')
					});
				}
			});
		},
		soundTest() {
			const sound = new Audio(`${url}/assets/message.mp3`);
			sound.volume = this.$store.state.device.soundVolume;
			sound.play();
		},
		pastedFileNamePreview() {
			return `${formatTimeString(new Date(), this.pastedFileName).replace(/{{number}}/g, `1`)}.png`
		},
		previewReaction() {
			const picker = this.$root.new(MkReactionPicker, {
				source: this.$refs.reactionsPreviewButton.$el,
				reactions: this.reactions.trim().split('\n'),
				showFocus: false,
			});
			picker.$once('chosen', reaction => {
				picker.close();
			});
		}
	}
});
</script>
