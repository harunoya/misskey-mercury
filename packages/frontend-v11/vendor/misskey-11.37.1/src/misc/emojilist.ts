// initial converted from https://github.com/muan/emojilib/commit/242fe68be86ed6536843b83f7e32f376468b38fb
//
// Imported rather than `require`d. v11 was a CommonJS bundle and this file is shared with its server
// build, so the list came in through `require('../emojilist.json')`. Under this package's ESM build
// that call resolves to nothing: the list was silently empty, and the `:name:` autocomplete then had
// only the instance's custom emojis in it — typing `:heart` matched nothing at all.
import emojilistJson from '../emojilist.json';

export type EmojiListEntry = {
	name: string;
	keywords: string[];
	char: string;
	category: 'people' | 'animals_and_nature' | 'food_and_drink' | 'activity' | 'travel_and_places' | 'objects' | 'symbols' | 'flags';
};

export const emojilist = emojilistJson as EmojiListEntry[];
