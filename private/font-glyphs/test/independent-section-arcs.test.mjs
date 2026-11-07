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
const readParams = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(readParams));
const variantData = readParams("variants");
await Geom.Init();

test("section sign exposes independent top and bottom arcs without changing existing ranks", () => {
	const choices = Variant.parse(variantData, {}).primes.get("section").variants;
	assert.equal(choices.size, 25);
	for (const [key, rank] of [["serifless", 1], ["flat-hooked", 2], ["serifed", 3], ["inward-serifed", 4], ["corner-hooked", 5]]) {
		assert.equal(choices.get(key).rank, rank, key);
	}
});

for (const [weight, slope] of [
	[120, "upright"], [120, "italic"],
	[420, "upright"], [420, "italic"],
	[920, "upright"], [920, "italic"],
]) {
	test(`section arc combinations generate valid ${weight} ${slope} outlines`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const choices = para.variants.primes.get("section").variants;
		for (const variant of choices.values()) {
			const name = `section.${variant.selector.section}`;
			const contours = glyphStore.queryByNameEnsured(name).geometry.toContours();
			assert.ok(contours.length, `${name}: empty`);
			assert.ok(contours.every(c => c.length >= 3 && c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))), name);
		}
	});
}
