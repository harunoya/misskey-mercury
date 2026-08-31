<template>
<div class="2fa totp-section">
	<p style="margin-top:0;">{{ $t('intro') }}<a :href="$t('url')" target="_blank">{{ $t('detail') }}</a></p>
	<ui-info warn>{{ $t('caution') }}</ui-info>
	<p v-if="!data && !$store.state.i.twoFactorEnabled"><ui-button @click="register">{{ $t('register') }}</ui-button></p>
	<template v-if="$store.state.i.twoFactorEnabled">
		<h2 class="heading">{{ $t('totp-header') }}</h2>
		<p>{{ $t('already-registered') }}</p>
		<ui-button @click="unregister">{{ $t('unregister') }}</ui-button>

		<template v-if="supportsCredentials">
			<hr class="totp-method-sep">

			<h2 class="heading">{{ $t('security-key-header') }}</h2>
			<p>{{ $t('security-key') }}</p>
			<div class="key-list">
				<div class="key" v-for="key in $store.state.i.securityKeysList" :key="key.id">
					<h3>
						{{ key.name }}
					</h3>
					<div class="last-used">
						{{ $t('last-used') }}
						<mk-time :time="key.lastUsed"/>
					</div>
					<ui-button @click="unregisterKey(key)">
						{{ $t('unregister') }}
					</ui-button>
				</div>
			</div>

			<ui-switch :value="usePasswordLessLogin" v-if="$store.state.i.securityKeysList.length > 0" @change="usePasswordLessLogin = $event; updatePasswordLessLogin()">
				{{ $t('use-password-less-login') }}
			</ui-switch>

			<ui-info warn v-if="registration && registration.error">{{ $t('something-went-wrong') }} {{ registration.error }}</ui-info>
			<ui-button v-if="!registration || registration.error" @click="addSecurityKey">{{ $t('register') }}</ui-button>

			<ol v-if="registration && !registration.error">
				<li v-if="registration.stage >= 0">
					{{ $t('activate-key') }}
					<fa icon="spinner" pulse fixed-width v-if="registration.saving && registration.stage == 0" />
				</li>
				<li v-if="registration.stage >= 1">
					<ui-form :disabled="registration.stage != 1 || registration.saving">
						<ui-input :value="keyName" @input="keyName = $event" :max="30">
							<span>{{ $t('security-key-name') }}</span>
						</ui-input>
						<ui-button @click="registerKey" :disabled="this.keyName.length == 0">
							{{ $t('register-security-key') }}
						</ui-button>
						<fa icon="spinner" pulse fixed-width v-if="registration.saving && registration.stage == 1" />
					</ui-form>
				</li>
			</ol>
		</template>
	</template>
	<div v-if="data && !$store.state.i.twoFactorEnabled">
		<ol>
			<li>{{ $t('authenticator') }}<a href="https://support.google.com/accounts/answer/1066447" rel="noopener" target="_blank">{{ $t('howtoinstall') }}</a></li>
			<li>{{ $t('scan') }}<br><img :src="data.qr"></li>
			<li>{{ $t('done') }}<br>
				<ui-input :value="token" @input="token = $event">{{ $t('token') }}</ui-input>
				<ui-button primary @click="submit">{{ $t('submit') }}</ui-button>
			</li>
		</ol>
		<ui-info>{{ $t('info') }}</ui-info>
	</div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { browserSupportsWebAuthn, startRegistration } from '@simplewebauthn/browser';
import i18n from '../../../../i18n';

export default defineComponent({
	i18n: i18n('desktop/views/components/settings.2fa.vue'),
	data() {
		return {
			data: null,
			supportsCredentials: browserSupportsWebAuthn(),
			usePasswordLessLogin: this.$store.state.i.usePasswordLessLogin,
			registration: null,
			keyName: '',
			token: null
		};
	},
	methods: {
		async authenticate() {
			const passwordResult = await this.$root.dialog({
				title: this.$t('enter-password'),
				input: {
					type: 'password'
				}
			});
			if (passwordResult.canceled) return null;

			let token = null;
			if (this.$store.state.i.twoFactorEnabled) {
				const tokenResult = await this.$root.dialog({
					title: this.$t('token'),
					input: { type: 'text' }
				});
				if (tokenResult.canceled) return null;
				token = tokenResult.result;
			}

			return { password: passwordResult.result, token };
		},

		async register() {
			const auth = await this.authenticate();
			if (auth == null) return;
			this.data = await this.$root.api('i/2fa/register', auth);
		},

		async unregister() {
			if (this.$store.state.i.securityKeysList.length > 0) {
				this.$root.dialog({
					type: 'warning',
					text: '先に登録済みのセキュリティキーを解除してください。'
				});
				return;
			}
			const auth = await this.authenticate();
			if (auth == null) return;
			await this.$root.api('i/2fa/unregister', auth);
			this.usePasswordLessLogin = false;
			this.$notify(this.$t('unregistered'));
			this.$store.state.i.twoFactorEnabled = false;
		},

		submit() {
			this.$root.api('i/2fa/done', {
				token: this.token
			}).then(() => {
				this.$notify(this.$t('success'));
				this.$store.state.i.twoFactorEnabled = true;
			}).catch(() => {
				this.$notify(this.$t('failed'));
			});
		},

		async registerKey() {
			this.registration.saving = true;
			const auth = await this.authenticate();
			if (auth == null) {
				this.registration.saving = false;
				return;
			}
			this.$root.api('i/2fa/key-done', {
				...auth,
				name: this.keyName,
				credential: this.registration.credential
			}).then(key => {
				this.registration = null;
				this.$store.state.i.securityKeysList.push({ ...key, lastUsed: new Date().toISOString() });
				this.$notify(this.$t('success'));
			}).catch(err => {
				this.registration.saving = false;
				this.registration.error = err.message || err.toString();
			});
		},

		async unregisterKey(key) {
			const auth = await this.authenticate();
			if (auth == null) return;
			await this.$root.api('i/2fa/remove-key', {
				...auth,
				credentialId: key.id
			});
			this.$store.state.i.securityKeysList = this.$store.state.i.securityKeysList.filter(item => item.id !== key.id);
			if (this.$store.state.i.securityKeysList.length === 0) this.usePasswordLessLogin = false;
			this.$notify(this.$t('key-unregistered'));
		},

		async addSecurityKey() {
			const auth = await this.authenticate();
			if (auth == null) return;
			this.registration = { stage: 0, saving: true, error: null, credential: null };
			try {
				const registrationOptions = await this.$root.api('i/2fa/register-key', auth);
				this.registration.credential = await startRegistration({ optionsJSON: registrationOptions });
				this.registration.saving = false;
				this.registration.stage = 1;
			} catch (err) {
				console.warn('Error while registering?', err);
				this.registration.error = err.message || err.toString();
				this.registration.saving = false;
				this.registration.stage = -1;
			}
		},
		updatePasswordLessLogin() {
			this.$root.api('i/2fa/password-less', {
				value: !!this.usePasswordLessLogin
			});
		}
	}
});
</script>

<style lang="stylus" scoped>
.totp-section
	.totp-method-sep
		margin 1.5em 0 1em
		border none
		border-top solid var(--lineWidth) var(--faceDivider)

	h2.heading
		margin 0

	.key
		padding 1em
		margin 0.5em 0
		background #161616
		border-radius 6px

		h3
			margin-top 0
			margin-bottom .3em

		.last-used
			margin-bottom .5em
</style>
