import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("lower-esh");
for (const slope of ["upright", "italic"]) {
	test(`independent esh diagonal cuts: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "lower-esh": "top-diagonal-cut-bottom-diagonal-cut" } },
		});
		const path = name => glyphPath(glyphStore.queryByNameEnsured(name));
		const variants = [...prime.variants.entries()].filter(([key]) => key.includes("diagonal-cut"));
		assert.equal(variants.length, 13);
		for (const [key, variant] of variants) {
			const suffix = variant.selector.esh;
			for (const family of ["esh", "eshBaseline", "eshHookBase"]) {
				const name = `${family}.${suffix}`;
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length, `${key}: ${family}`);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${key}: ${family}`);
			}
			for (const family of ["eshCurlyTail", "dotlessiStretchedHookLeftRTail", "reveshLoop", "Is", "is"]) {
				glyphStore.queryByNameEnsured(`${family}.${variant.selector[family]}`);
			}
			assert.equal(path(`eshHookBase.${suffix}`), path("eshHookBase.compact"));
		}
		const selected = prime.variants.get("top-diagonal-cut-bottom-diagonal-cut");
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x283)), path(`esh.${selected.selector.esh}`));
		assert.notEqual(path(`esh.${selected.selector.esh}`), path("esh.diagonalTailed"));
		assert.notEqual(path(`esh.${selected.selector.esh}`), path("esh.tailed"));
		assert.equal(path("eshHookBase.topDiagonalCutBottomDiagonalCut"), path("eshHookBase.compact"));
	});
}
