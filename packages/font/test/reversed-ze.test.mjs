import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geom from "@iosevka/geometry";
import { buildGlyphs } from "../../font-glyphs/lib/index.mjs";
import { getParametersT } from "../src/param/index.mjs";

await Geom.Init();
const makePara = await getParametersT({
	paramsDir: fileURLToPath(new URL("../../../params", import.meta.url)),
});

for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`reversed ze remains non-descending: ${slope} ${weight}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Reversed ze test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "cyrl-ze": "tall-serifless" } },
		});
		const prime = para.variants.primes.get("cyrl-ze");
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Cyrillic-Ze",
			glyphIsNeeded: id => id.startsWith("cyrl/revze") || id.startsWith("cyrl/ze"),
		});
		let checked = 0;
		for (const [key, variant] of prime.variants) {
			if (!key.startsWith("tall-")) continue;
			const nonTall = prime.variants.get(key.slice(5));
			assert.ok(nonTall, key);
			assert.equal(variant.selector["cyrl/revze"], nonTall.selector["cyrl/revze"], key);
			assert.notEqual(variant.selector["cyrl/ze"], nonTall.selector["cyrl/ze"], key);
			const glyph = glyphStore.queryByNameEnsured(`cyrl/revze.${variant.selector["cyrl/revze"]}`);
			const points = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours()
				.flat().map(p => glyph.gizmo.unapply(p));
			assert.ok(Math.min(...points.map(p => p.y)) > -para.xHeight * 0.1, key);
			checked++;
		}
		assert.ok(checked > 0);
		assert.equal(para.variantSelector["cyrl/revze"], "serifless");
		assert.equal(para.variantSelector["cyrl/ze"], "tallSerifless");
	});
}
