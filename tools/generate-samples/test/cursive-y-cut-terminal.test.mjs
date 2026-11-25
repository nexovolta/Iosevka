import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("y");
for (const [slope, selection] of [
	["upright", "cursive-vertical-cut-serifless"],
	["italic", "cursive-flat-hump-diagonal-cut-motion-serifed"],
]) {
	test(`cursive y cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { y: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.includes("vertical-cut") && !key.includes("diagonal-cut")) continue;
			for (const family of ["y", "yCap", "yShortLeg", "yLowBar", "yBelowdot/base"]) {
				const name = `${family}.${variant.selector.y}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			assert.doesNotMatch(variant.selector.yHookRight, /Cut/);
			assert.match(variant.selector["y/nonCursive"], /^straight/);
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x79)), path(`y.${selector.y}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x1b4)), path(`yHookRight.${selector.yHookRight}`));
		assert.notEqual(path("y.cursiveVerticalCutSerifless"), path("y.cursiveSerifless"));
		assert.notEqual(path("y.cursiveDiagonalCutSerifless"), path("y.cursiveSerifless"));
	});
}
