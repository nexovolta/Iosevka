import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("r");
for (const [slope, selection] of [
	["upright", "vertical-cut-serifless"],
	["italic", "diagonal-tailed-diagonal-cut-base-serifed"],
]) {
	test(`lower r cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { r: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.includes("vertical-cut") && !key.includes("diagonal-cut")) continue;
			for (const family of ["r", "rLongLeg", "rCapLongLeg", "turnr", "turnrLongLeg", "fInsular", "FInsular", "rPalatalHook"]) {
				const name = `${family}.${variant.selector.r}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			assert.doesNotMatch(variant.selector["r/rTailBase"], /(?:vertical|diagonal)Cut/i);
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x72)), path(`r.${selector.r}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0xa77c)), path(`fInsular.${selector["r/insularBase"]}`));
		const suffix = selector.r.replace(/VerticalCut|DiagonalCut/, "").replace(/^(vertical|diagonal)Cut/, "").replace(/^./, c => c.toLowerCase());
		assert.equal(path(`rPalatalHook.${selector.r}`), path(`rPalatalHook.${suffix}`));
		assert.notEqual(path("r.verticalCutSerifless"), path("r.serifless"));
		assert.notEqual(path("r.diagonalCutSerifless"), path("r.serifless"));
		for (const body of ["flatTop", "earlessCorner", "earlessRounded"]) {
			for (const cut of ["VerticalCut", "DiagonalCut"]) {
				assert.notEqual(path(`r.${body}${cut}Serifless`), path(`r.${body}Serifless`));
				assert.equal(path(`rPalatalHook.${body}${cut}Serifless`), path(`rPalatalHook.${body}Serifless`));
			}
		}
	});
}
