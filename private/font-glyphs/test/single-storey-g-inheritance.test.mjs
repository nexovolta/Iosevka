import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");
const hooks = [["", "BentHook"], ["-flat-hooked", "FlatHook"], ["-corner-hooked", "CornerHook"]];
const ears = [["", "Serifless"], ["-earless-rounded", "EarlessRounded"], ["-earless-corner", "EarlessCorner"],
	["-flat-bowl", "FlatBowlSerifless"], ["-flat-bowl-serifed", "FlatBowlSerifed"], ["-top-cut", "TopCut"]];
await Geom.Init();

test("double-storey g variants map their hooks and ears to single-storey g", () => {
	const choices = Variant.parse(variants).primes.get("g").variants;
	for (const [prefix, hook] of hooks) for (const [ear, suffix] of ears) {
		for (const openness of ["open", "disjoint"]) {
			const key = `double-storey-${openness}${prefix}${ear}`;
			const variant = choices.get(key);
			assert.ok(variant, key);
			assert.equal(variant.selector["g/singleStorey.sans"], `singleStorey${hook}${suffix}`, key);
		}
	}
	for (const key of ["double-circle", "double-circle-disjoint"]) {
		assert.equal(choices.get(key).selector["g/singleStorey.sans"], "singleStoreyBentHookSerifless");
	}
});

for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`single-storey g inherited outlines exist at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const prime = para.variants.primes.get("g");
		for (const variant of prime.variants.values()) {
			for (const [selector, name] of [
				["g/singleStorey.sans", "g"],
				["g/singleStorey.slab.upright", "g"],
				["g/singleStorey.slab.italic", "g"],
				["gCrossedTail/singleStorey.sans", "gCrossedTail"],
				["g/hookTopBase", "g"],
			]) {
				const suffix = variant.selector[selector];
				if (!suffix) continue;
				const glyph = glyphStore.queryByNameEnsured(`${name}.${suffix}`);
				const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length && contours.every(c => c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))), `${variant.key}: ${name}.${suffix}`);
			}
		}
	});
}
