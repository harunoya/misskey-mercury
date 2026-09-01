/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import tinycolor from 'tinycolor2';
import { compile, getBuiltinThemes, validateTheme } from '@@/js/theme.js';
import type { CompiledTheme, Theme } from '@@/js/theme.js';
import lightBaseTheme from '@@/themes/_light.json5';
import darkBaseTheme from '@@/themes/_dark.json5';

const MI_RED_LIGHT_NAME = 'Mi Red Light';
const MI_RED_DARK_NAME = 'Mi Red Dark';
const MI_RED_ACCENT = '#DC143C';
const WCAG_AA_NORMAL_TEXT_CONTRAST = 4.5;
const METALLIC_THEME_NAMES = [
	'Metal Silver Light',
	'Metal Platinum Light',
	'Metal Champagne Gold Light',
	'Metal Rose Gold Light',
	'Metal Titanium Light',
	'Metal Gunmetal Dark',
	'Metal Black Chrome Dark',
	'Metal Copper Dark',
	'Metal Bronze Dark',
	'Metal Cobalt Steel Dark',
] as const;

const findBuiltinThemeByName = (themes: readonly Theme[], name: string): Theme => {
	const theme = themes.find((candidate) => candidate.name === name);
	if (theme === undefined) {
		throw new Error(`Builtin theme is not registered: ${name}`);
	}
	return theme;
};

const getMiRedThemes = async (): Promise<{ light: Theme; dark: Theme }> => {
	const themes = await getBuiltinThemes();
	return {
		light: findBuiltinThemeByName(themes, MI_RED_LIGHT_NAME),
		dark: findBuiltinThemeByName(themes, MI_RED_DARK_NAME),
	};
};

// Builtin theme files only carry overrides; the app merges them over the
// declared base theme at apply time, so derived props must be merged here too.
const compileWithBase = (theme: Theme): CompiledTheme => {
	const base = theme.base === 'dark' ? darkBaseTheme : lightBaseTheme;
	return compile({ ...theme, props: { ...base.props, ...theme.props } });
};

const contrastRatio = (foreground: string, background: string): number =>
	tinycolor.readability(foreground, background);

describe('builtin themes: Mi Red Light / Mi Red Dark', () => {
	test('both themes are registered as builtin themes', async () => {
		// Given: the builtin theme registry
		// When: all builtin themes are loaded
		const themes = await getBuiltinThemes();

		// Then: both are found by name, independent of ordering or unrelated additions
		assert.isDefined(findBuiltinThemeByName(themes, MI_RED_LIGHT_NAME));
		assert.isDefined(findBuiltinThemeByName(themes, MI_RED_DARK_NAME));
	});

	test('both themes have unique ids across all builtin themes', async () => {
		// Given: the two Mi Red themes
		const { light, dark } = await getMiRedThemes();

		// When: every builtin theme id is collected
		const ids = (await getBuiltinThemes()).map((theme) => theme.id);

		// Then: the pair differs from each other and no id collides registry-wide
		assert.notStrictEqual(light.id, dark.id);
		assert.strictEqual(new Set(ids).size, ids.length);
	});

	test('both themes pass validateTheme and declare the expected base kinds', async () => {
		// Given: the two Mi Red themes
		const { light, dark } = await getMiRedThemes();

		// When: they are validated
		// Then: both are valid and based on light / dark respectively
		assert.isTrue(validateTheme(light));
		assert.isTrue(validateTheme(dark));
		assert.strictEqual(light.base, 'light');
		assert.strictEqual(dark.base, 'dark');
	});

	test('both themes compile to the #DC143C accent', async () => {
		// Given: the two Mi Red themes
		const { light, dark } = await getMiRedThemes();

		// When: they are compiled with their base themes merged
		const expected = tinycolor(MI_RED_ACCENT).toRgbString();

		// Then: the compiled accent is the Mi red accent color
		assert.strictEqual(compileWithBase(light).accent, expected);
		assert.strictEqual(compileWithBase(dark).accent, expected);
	});

	test('both themes keep WCAG AA contrast for fgOnAccent on the accent', async () => {
		// Given: the two Mi Red themes compiled with their base themes
		const { light, dark } = await getMiRedThemes();

		// When: the on-accent foreground and accent are measured for both themes
		const compiledLight = compileWithBase(light);
		const compiledDark = compileWithBase(dark);
		const expectedOnAccent = tinycolor('#fff').toRgbString();

		// Then: the white on-accent foreground meets WCAG AA on the accent
		assert.strictEqual(compiledLight.fgOnAccent, expectedOnAccent);
		assert.strictEqual(compiledDark.fgOnAccent, expectedOnAccent);
		assert.isAtLeast(contrastRatio(compiledLight.fgOnAccent, compiledLight.accent), WCAG_AA_NORMAL_TEXT_CONTRAST);
		assert.isAtLeast(contrastRatio(compiledDark.fgOnAccent, compiledDark.accent), WCAG_AA_NORMAL_TEXT_CONTRAST);
	});

	test('Mi Red Light keeps WCAG AA contrast for accent and fg on bg', async () => {
		// Given: Mi Red Light compiled with its base theme
		const { light } = await getMiRedThemes();

		// When: the compiled colors are measured
		const compiled = compileWithBase(light);

		// Then: accent and foreground text meet WCAG AA on the background
		assert.isAtLeast(contrastRatio(compiled.accent, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST);
		assert.isAtLeast(contrastRatio(compiled.fg, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST);
	});

	test('Mi Red Dark keeps WCAG AA contrast for fg and derived accent text colors on bg', async () => {
		// Given: Mi Red Dark compiled with its base theme
		const { dark } = await getMiRedThemes();

		// When: the compiled colors are measured
		const compiled = compileWithBase(dark);

		// Then: fg and the derived #DC143C text colors meet WCAG AA on the background
		assert.isAtLeast(contrastRatio(compiled.fg, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST);
		assert.isAtLeast(contrastRatio(compiled.link, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST);
		assert.isAtLeast(contrastRatio(compiled.mention, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST);
		assert.isAtLeast(contrastRatio(compiled.hashtag, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST);
		assert.isAtLeast(contrastRatio(compiled.renote, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST);
	});
});

describe('builtin themes: metallic collection', () => {
	test('all ten metallic themes are registered, valid, and have unique ids', async () => {
		const themes = await getBuiltinThemes();
		const metallicThemes = METALLIC_THEME_NAMES.map(name => findBuiltinThemeByName(themes, name));

		assert.strictEqual(metallicThemes.length, 10);
		assert.strictEqual(new Set(metallicThemes.map(theme => theme.id)).size, metallicThemes.length);
		assert.isTrue(metallicThemes.every(theme => validateTheme(theme)));
		assert.strictEqual(metallicThemes.filter(theme => theme.base === 'light').length, 5);
		assert.strictEqual(metallicThemes.filter(theme => theme.base === 'dark').length, 5);
	});

	test('metallic themes compile their header sheen and button gradient colors', async () => {
		const themes = await getBuiltinThemes();

		for (const name of METALLIC_THEME_NAMES) {
			const compiled = compileWithBase(findBuiltinThemeByName(themes, name));

			assert.match(compiled.panelHeaderBg, /^linear-gradient\(135deg,/);
			assert.isTrue(tinycolor(compiled.buttonGradateA).isValid());
			assert.isTrue(tinycolor(compiled.buttonGradateB).isValid());
		}
	});

	test('metallic themes keep WCAG AA contrast for primary text and gradient buttons', async () => {
		const themes = await getBuiltinThemes();

		for (const name of METALLIC_THEME_NAMES) {
			const compiled = compileWithBase(findBuiltinThemeByName(themes, name));

			assert.isAtLeast(contrastRatio(compiled.fg, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST, `${name}: fg on bg`);
			assert.isAtLeast(contrastRatio(compiled.fg, compiled.panel), WCAG_AA_NORMAL_TEXT_CONTRAST, `${name}: fg on panel`);
			assert.isAtLeast(contrastRatio(compiled.accent, compiled.bg), WCAG_AA_NORMAL_TEXT_CONTRAST, `${name}: accent on bg`);
			assert.isAtLeast(contrastRatio(compiled.fgOnAccent, compiled.accent), WCAG_AA_NORMAL_TEXT_CONTRAST, `${name}: fgOnAccent on accent`);
			assert.isAtLeast(contrastRatio(compiled.fgOnAccent, compiled.buttonGradateA), WCAG_AA_NORMAL_TEXT_CONTRAST, `${name}: fgOnAccent on gradient start`);
			assert.isAtLeast(contrastRatio(compiled.fgOnAccent, compiled.buttonGradateB), WCAG_AA_NORMAL_TEXT_CONTRAST, `${name}: fgOnAccent on gradient end`);
		}
	});
});
