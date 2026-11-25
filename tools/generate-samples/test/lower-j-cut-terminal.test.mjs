import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("j");
const tops = [
	["plain-top", "topSerifless"],
	["top-left-serifed", "topHooky"],
	["top-left-short-serifed", "topHookyShort"],
	["top-right-serifed", "topReverseHooky"],
	["top-right-short-serifed", "topReverseHookyShort"],
	["top-center-serifed", "topCenterSerifed"],
	["top-center-short-serifed", "topCenterShortSerifed"],
	["top-tailed", "topTailed"],
	["top-flat-tailed", "topFlatTailed"],
	["top-semi-tailed", "topSemiTailed"],
	["top-diagonal-tailed", "topDiagonalTailed"],
];
for (const [slope, selection] of [
	["upright", "plain-top-vertical-cut"],
	["italic", "top-tailed-diagonal-cut"],
]) {
	test(`lower j cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { j: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const check = name => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, name);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		};
		for (const [top, topSuffix] of tops) for (const [cut, cutSuffix] of [["vertical", "Vertical"], ["diagonal", "Diagonal"]]) {
			const selector = prime.variants.get(`${top}-${cut}-cut`).selector;
			const suffix = `${topSuffix}Bottom${cutSuffix}Cut`;
			assert.equal(selector.dotlessj, suffix);
			assert.match(selector.dotlessjHookTop, /BottomBentHook$/);
			for (const family of ["dotlessj", "dotlessjBar"]) check(`${family}.${suffix}`);
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x237)), path(`dotlessj.${selector.dotlessj}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x25f)), path(`dotlessjBar.${selector.dotlessj}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x284)), path(`dotlessjBarHookTop.${selector.dotlessjHookTop}`));
		assert.equal(path(`dotlessjBarHookTop.${selector.dotlessjHookTop}`), path("dotlessjBarHookTop.topSeriflessBottomBentHook"));
		assert.notEqual(path("dotlessj.topSeriflessBottomVerticalCut"), path("dotlessj.topSeriflessBottomBentHook"));
		assert.notEqual(path("dotlessj.topSeriflessBottomDiagonalCut"), path("dotlessj.topSeriflessBottomBentHook"));
	});
}
