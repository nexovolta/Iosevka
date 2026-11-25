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
	["rounded", "Rounded", "serifless"],
	["serifed", "Serifed", "unilateralSerifed"],
	["inward-serifed", "InwardSerifed", "unilateralInwardSerifed"],
	["flat-hooked", "FlatHook", "topFlatHook"],
	["corner-hooked", "CornerHook", "topCornerHook"],
	["vertical-cut", "VerticalCut", "serifless"],
	["diagonal-cut", "DiagonalCut", "serifless"],
];
const bars = [
	["", ""],
	["diagonal-crossbar-rising-", "DiagonalCrossbar"],
	["diagonal-crossbar-falling-", "DiagonalCrossbarFalling"],
];

for (const [slope, selection] of [
	["upright", "top-vertical-cut-bottom-diagonal-cut"],
	["italic", "top-diagonal-cut-bottom-vertical-cut"],
]) {
	test(`Cyrillic E cut selectors and outlines: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "cyrl-capital-e": selection, "cyrl-e": selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		for (const [primeName, glyphs, capital] of [
			["cyrl-capital-e", ["cyrl/E", "cyrl/YeUkrainian"], true],
			["cyrl-e", ["cyrl/e", "cyrl/yeUkrainian"], false],
		]) {
			const prime = primes.get(primeName);
			for (const [barKey, barSuffix] of bars) {
				for (const middle of capital ? [false, true] : [false]) {
					for (const [top, topSuffix, topSerif] of styles) {
						for (const [bottom, bottomSuffix] of styles) {
							if (!top.endsWith("-cut") && !bottom.endsWith("-cut")) continue;
							const key = `${barKey}top-${top}-bottom-${bottom}${middle ? "-middle-serifed" : ""}`;
							const variant = prime.variants.get(key);
							assert.ok(variant, `${primeName}.${key}`);
							const stem = `top${topSuffix}Bottom${bottomSuffix}`;
							const suffix = `${stem}${middle ? "Capped" : ""}${barSuffix}`;
							for (const g of glyphs) {
								assert.equal(variant.selector[g], suffix, `${primeName}.${key}`);
								assert.equal(variant.selector[`${g}/topSerif`], topSerif, `${primeName}.${key}`);
								const shape = glyph(`${g}.${suffix}`);
								const contours = new Geom.SimplifyGeometry(shape.geometry, shape.gizmo, true).toContours();
								assert.ok(contours.length, `${g}.${suffix}`);
								assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${g}.${suffix}`);
							}
							if (capital) {
								assert.equal(variant.selector["currency/euroSign"], stem, key);
								assert.ok(glyphPath(glyph(`currency/euroSign.${stem}`)));
							}
						}
					}
				}
			}
			const selected = prime.variants.get(selection).selector;
			for (const [g, cp] of capital
				? [[glyphs[0], 0x42d], [glyphs[1], 0x404]]
				: [[glyphs[0], 0x44d], [glyphs[1], 0x454]])
				assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), glyphPath(glyph(`${g}.${selected[g]}`)));
		}
	});
}
