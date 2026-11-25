import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("f");
for (const [slope, selection] of [
	["upright", "vertical-cut-serifless"],
	["italic", "diagonal-cut-diagonal-tailed-asymmetric"],
]) {
	test(`lower f cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { f: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.startsWith("vertical-cut") && !key.startsWith("diagonal-cut") && !key.includes("bottom-vertical-cut") && !key.includes("bottom-diagonal-cut")) continue;
			for (const family of ["f", "fPalatalHook"]) {
				const name = `${family}.${variant.selector.f}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			if (!key.includes("bottom-vertical-cut") && !key.includes("bottom-diagonal-cut")) {
				assert.doesNotMatch(variant.selector.fHookBottom, /Cut/);
				assert.doesNotMatch(variant.selector.fengTrill, /Cut/);
			}
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x66)), path(`f.${selector.f}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x1df00)), path(`fengTrill.${selector.fengTrill}`));
		const suffix = selector.f.replace(/^(vertical|diagonal)Cut/, "").replace(/^./, c => c.toLowerCase());
		assert.equal(path(`fPalatalHook.${selector.f}`), path(`fPalatalHook.${suffix}`));
		assert.notEqual(path("f.verticalCutSerifless"), path("f.serifless"));
		assert.notEqual(path("f.diagonalCutSerifless"), path("f.serifless"));
		const crossbar = name => path(name).split("M").at(-1);
		assert.equal(crossbar("f.verticalCutSerifless"), crossbar("f.serifless"));
		assert.equal(crossbar("f.diagonalCutSerifless"), crossbar("f.serifless"));
		assert.equal(glyph("f.bottomVerticalCut").geometry.toBezArcs().length, 3);
		for (const suffix of ["bottomVerticalCut", "bottomDiagonalCut", "verticalCutBottomDiagonalCut", "cornerHookBottomVerticalCut"]) {
			const fallback = suffix.replace(/Bottom(?:Vertical|Diagonal)Cut/, "Tailed")
				.replace(/^bottom(?:Vertical|Diagonal)Cut/, "tailed")
				.replace(/^(vertical|diagonal)Cut/, "")
				.replace(/^./, c => c.toLowerCase());
			assert.equal(path(`fPalatalHook.${suffix}`), path(`fPalatalHook.${fallback}`), suffix);
			assert.notEqual(path(`f.${suffix}`), path(`f.${fallback}`), suffix);
		}
	});
}
