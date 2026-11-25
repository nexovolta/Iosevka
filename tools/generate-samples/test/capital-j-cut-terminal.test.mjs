import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("capital-j");
const bars = [
	["full-topbar", "FullTopbar"], ["long-topbar", "LongTopbar"], ["medium-topbar", "MediumTopbar"],
	["short-topbar", "ShortTopbar"], ["serifless", "Serifless"], ["symmetric-serif", "SymmetricSerif"],
	["asymmetric-serif", "AsymmetricSerif"], ["symmetric-medium-serif", "SymmetricMediumSerif"],
	["asymmetric-long-serif", "AsymmetricLongSerif"], ["asymmetric-full-topbar", "AsymmetricFullTopbar"],
];
for (const [slope, selection] of [
	["upright", "vertical-cut-serifless"],
	["italic", "descending-diagonal-cut-serifless"],
]) {
	test(`capital J cut variants: ${slope}`, async () => {
		const options = {
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
		};
		const { glyphStore } = await buildGlyphData({ ...options, variants: { design: { "capital-j": selection } } });
		const { glyphStore: reference } = await buildGlyphData({ ...options, variants: { design: { "capital-j": "serifless" } } });
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const check = name => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, name);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		};
		for (const [height, heightSuffix] of [["", ""], ["descending-", "descending"]])
			for (const [cut, cutSuffix] of [["vertical-cut", "VerticalCut"], ["diagonal-cut", "DiagonalCut"]])
				for (const [bar, barSuffix] of bars) {
					const key = `${height}${cut}-${bar}`;
					const suffix = `${heightSuffix}${heightSuffix ? cutSuffix : cutSuffix[0].toLowerCase() + cutSuffix.slice(1)}${barSuffix}`;
					const selector = prime.variants.get(key).selector;
					assert.equal(selector.J, suffix, key);
					assert.equal(selector["J/rTailBase"], `bentHook${barSuffix}`, key);
					for (const family of ["J", "smcpJ"]) check(`${family}.${suffix}`);
				}
		const selected = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x4a)), path(`J.${selected.J}`));
		assert.equal(path("J/rTailBase"), path(`J.${selected["J/rTailBase"]}`));
		assert.equal(path("TRTail.phonotypic"), glyphPath(reference.queryByNameEnsured("TRTail.phonotypic")));
		assert.notEqual(path("J.verticalCutSerifless"), path("J.bentHookSerifless"));
		assert.notEqual(path("J.diagonalCutSerifless"), path("J.bentHookSerifless"));
	});
}
