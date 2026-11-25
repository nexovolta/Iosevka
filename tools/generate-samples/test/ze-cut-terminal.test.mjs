import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const primes = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes;
const styles = [
	["rounded", "Rounded", "serifless"], ["serifed", "Serifed", "unilateralSerifed"],
	["inward-serifed", "InwardSerifed", "unilateralInwardSerifed"],
	["flat-hooked", "FlatHook", "topFlatHook"], ["corner-hooked", "CornerHook", "topCornerHook"],
	["vertical-cut", "VerticalCut", "topVerticalCut"], ["diagonal-cut", "DiagonalCut", "topDiagonalCut"],
];
for (const [slope, selection] of [
	["upright", "top-vertical-cut-bottom-diagonal-cut"],
	["italic", "top-diagonal-cut-bottom-vertical-cut"],
]) {
	test(`independent Ze cuts and top-only Yogh cuts: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "cyrl-capital-ze": selection, "cyrl-ze": selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const outline = name => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, name);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		};
		for (const [top, topSuffix, topOnly] of styles) for (const [bottom, bottomSuffix] of styles) {
			if (!top.endsWith("-cut") && !bottom.endsWith("-cut")) continue;
			const key = `top-${top}-bottom-${bottom}`;
			const suffix = `top${topSuffix}Bottom${bottomSuffix}`;
			const cap = primes.get("cyrl-capital-ze").variants.get(key).selector;
			const low = primes.get("cyrl-ze").variants.get(key).selector;
			assert.equal(cap["cyrl/Ze"], suffix, key);
			assert.equal(cap["cyrl/revZe"], suffix, key);
			assert.equal(cap["cyrl/Ze/topSerif"], topOnly, key);
			assert.equal(cap["cyrl/Dzze/Ze"], `topRoundedBottom${bottomSuffix}`, key);
			assert.equal(low["cyrl/ze"], suffix, key);
			assert.equal(low["cyrl/ze/topSerif"], topOnly, key);
			assert.equal(low["cyrl/ze.BGR"], `tallTop${topSuffix}Bottom${bottomSuffix}`, key);
			assert.equal(low["cyrl/dzze.upright/ze"], `topRoundedBottom${bottomSuffix}`, key);
			const protectedTop = top.endsWith("-cut") ? "Rounded" : topSuffix;
			assert.equal(low["latn/epsilon/descBase"], `top${protectedTop}BottomSerifed`, key);
			assert.equal(low["latn/revepsilon/descBase"], `top${protectedTop}BottomSerifed`, key);
			for (const name of ["cyrl/Ze", "cyrl/ze", "cyrl/revZe", "cyrl/revze", "cyrl/Dhe", "cyrl/dhe", "Tresillo", "tresillo"])
				outline(`${name}.${suffix}`);
			outline(`cyrl/ze.tallTop${topSuffix}Bottom${bottomSuffix}`);
		}
		const capSel = primes.get("cyrl-capital-ze").variants.get(selection).selector;
		const lowSel = primes.get("cyrl-ze").variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x417)), path(`cyrl/Ze.${capSel["cyrl/Ze"]}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x437)), path(`cyrl/ze.${lowSel["cyrl/ze"]}`));
		for (const [name, cp, top] of [
			["Yogh", 0x21c, capSel["cyrl/Ze/topSerif"]],
			["Et", 0xa76a, capSel["cyrl/Ze/topSerif"]],
			["yogh", 0x21d, lowSel["cyrl/ze/topSerif"]],
			["et", 0xa76b, lowSel["cyrl/ze/topSerif"]],
		]) {
			outline(`${name}.${top}`);
			assert.notEqual(path(`${name}.${top}`), path(`${name}.serifless`));
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), path(`${name}.${top}`));
		}
		for (const family of ["RRotunda", "rRotunda"]) {
			const rounded = `${family}.straightSerifless.serifless`;
			const vertical = `${family}.straightSerifless.topVerticalCut`;
			const diagonal = `${family}.straightSerifless.topDiagonalCut`;
			for (const name of [rounded, vertical, diagonal]) outline(name);
			assert.notEqual(path(vertical), path(rounded), family);
			assert.notEqual(path(diagonal), path(rounded), family);
			assert.notEqual(path(vertical), path(diagonal), family);
		}
	});
}
