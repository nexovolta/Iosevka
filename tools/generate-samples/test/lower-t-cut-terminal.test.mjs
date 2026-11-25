import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("t");
for (const [slope, selection] of [
	["upright", "vertical-cut"],
	["italic", "diagonal-cut-asymmetric-short-neck"],
]) {
	test(`lower t cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { t: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.startsWith("vertical-cut") && !key.startsWith("diagonal-cut")) continue;
			for (const family of ["t", "t/pack75", "t/pack80", "t/phonotypic", "t/phoneticLeft2", "t/phoneticLeft3", "tPalatalHook"]) {
				const name = `${family}.${variant.selector.t}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			assert.match(variant.selector.tHookTop, /^flatHook/);
			assert.match(variant.selector.tRTail, /^hookless/);
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x74)), path(`t.${selector.t}`));
		const suffix = selector.t.replace(/^(vertical|diagonal)Cut/, "bentHook");
		assert.equal(path(`tPalatalHook.${selector.t}`), path(`tPalatalHook.${suffix}`));
		assert.notEqual(path("t.verticalCut"), path("t.bentHook"));
		assert.notEqual(path("t.diagonalCut"), path("t.bentHook"));
	});
}
