import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("lower-eszet");
for (const [slope, selection] of [
	["upright", "traditional-vertical-cut-serifless"],
	["italic", "traditional-diagonal-cut-diagonal-tailed-middle-serifed"],
]) {
	test(`traditional eszet cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "lower-eszet": selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.startsWith("traditional-vertical-cut-") && !key.startsWith("traditional-diagonal-cut-")) continue;
			const g = glyph(`eszet.${variant.selector.eszet}`);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, key);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), key);
			assert.match(variant.selector.middleScotsS, /^traditionalBentHook/);
			if (/descending|tailed/.test(key)) assert.doesNotMatch(key, /bottom-serifed|dual-serifed/);
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0xdf)), path(`eszet.${selector.eszet}`));
		assert.equal(path("middleScotsS"), path(`middleScotsS.${selector.eszet}`));
		assert.equal(path("middleScotsS"), path(`middleScotsS.${selector.middleScotsS}`));
		assert.notEqual(path("eszet.traditionalVerticalCutSerifless"), path("eszet.traditionalBentHookSerifless"));
		assert.notEqual(path("eszet.traditionalDiagonalCutSerifless"), path("eszet.traditionalBentHookSerifless"));
	});
}
