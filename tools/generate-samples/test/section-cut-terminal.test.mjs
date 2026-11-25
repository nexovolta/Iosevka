import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const styles = [
	["rounded", "Rounded", "serifless"],
	["serifed", "Serifed", "serifed"],
	["inward-serifed", "InwardSerifed", "inwardSerifed"],
	["flat-hooked", "FlatHook", "flatHook"],
	["corner-hooked", "CornerHook", "cornerHook"],
	["vertical-cut", "VerticalCut", "verticalCut"],
	["diagonal-cut", "DiagonalCut", "diagonalCut"],
];
const variants = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("section").variants;

for (const [slope, selection] of [
	["upright", "top-vertical-cut-bottom-diagonal-cut"],
	["italic", "top-diagonal-cut-bottom-vertical-cut"],
]) {
	test(`section cut selectors and outlines: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { section: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [top, topSuffix, topSelector] of styles) {
			for (const [bottom, bottomSuffix, bottomSelector] of styles) {
				if (!top.endsWith("-cut") && !bottom.endsWith("-cut")) continue;
				const key = top === bottom ? top : `top-${top}-bottom-${bottom}`;
				const selector = variants.get(key).selector;
				assert.equal(selector["section/topHook"], topSelector, key);
				assert.equal(selector["section/bottomHook"], bottomSelector, key);
				const name = `section.top${topSuffix}Bottom${bottomSuffix}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.equal(contours.length, 2, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				assert.equal(path(`section.${selector.section}`), path(name), key);
			}
		}
		const selected = variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0xa7)), path(`section.${selected.section}`));
		assert.equal(path("section/topHook"), path(`section/topHook.${selected["section/topHook"]}`));
		assert.equal(path("section/bottomHook"), path(`section/bottomHook.${selected["section/bottomHook"]}`));
		assert.ok(glyphPath(glyphStore.queryByUnicodeEnsured(0x2e39)));
	});
}
