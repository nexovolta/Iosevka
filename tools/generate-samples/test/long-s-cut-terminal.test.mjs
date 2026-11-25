import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("long-s");
for (const [slope, selection] of [
	["upright", "vertical-cut-tailed"],
	["italic", "diagonal-cut-diagonal-tailed"],
]) {
	test(`long s cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "long-s": selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.startsWith("vertical-cut-") && !key.startsWith("diagonal-cut-")) continue;
			for (const [family, selector] of [["longs", "longs"], ["longs", "longs/compLigLeft"], ["longsBar", "longsBar"]]) {
				const name = `${family}.${variant.selector[selector]}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			if (/descending|tailed/.test(key)) assert.doesNotMatch(key, /bottom-serifed|double-serifed/);
			assert.match(variant.selector.longssHookBottom, /^longSSLigTailed/);
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x17f)), path(`longs.${selector.longs}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x1e9d)), path(`longsBar.${selector.longsBar}`));
		assert.equal(path("longssHookBottom"), path(`eszet.${selector.longssHookBottom}`));
		assert.notEqual(path("longs.verticalCutSerifless"), path("longs.bentHookSerifless"));
		assert.notEqual(path("longs.diagonalCutSerifless"), path("longs.bentHookSerifless"));
	});
}
