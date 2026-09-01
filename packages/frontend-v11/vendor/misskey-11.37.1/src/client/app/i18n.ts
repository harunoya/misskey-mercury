import { lang, locale } from './config';
import { precompileMessages } from '../../../../../src/compat/shim-i18n';

export default function(scope?: string) {
	const texts = scope ? locale[scope] || {} : {};
	texts['@'] = locale['common'];
	texts['@deck'] = locale['deck'];
	return {
		sync: false,
		locale: lang,
		messages: {
			// These strings are written in vue-i18n 8 syntax, which vue-i18n 9's parser rejects.
			// Pre-compiling them to message functions keeps the 8 semantics and skips the parser.
			[lang]: precompileMessages(texts)
		}
	};
}
