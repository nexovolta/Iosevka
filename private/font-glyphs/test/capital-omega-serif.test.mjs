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
await Geom.Init();

for (const [weight, slope] of [[120, "upright"], [420, "upright"], [920, "upright"], [920, "italic"]]) {
	test(`serifed capital omega at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "slab", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		assert.equal(para.variantSelector["grek/Omega"], "serifed");
		const sansArgv = { ...argv, shape: { ...argv.shape, serifs: "sans" } };
		const sansPara = init(data, sansArgv);
		Variant.apply(variants, sansPara, sansArgv);
		assert.equal(sansPara.variantSelector["grek/Omega"], "serifless");
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const prime = para.variants.primes.get("capital-omega");
		const omega = glyphStore.queryByUnicode(0x3a9);
		const serifed = glyphStore.queryByNameEnsured(prime.variants.get("serifed").get(omega));
		const serifless = glyphStore.queryByNameEnsured(prime.variants.get("serifless").get(omega));
		assert.deepEqual(omega.geometry.toContours(), serifed.geometry.toContours());
		assert.notDeepEqual(serifed.geometry.toContours(), serifless.geometry.toContours());
		assert.equal(serifed.advanceWidth, serifless.advanceWidth);
		assert.ok(serifed.geometry.toContours().flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
		const small = glyphStore.queryByUnicode(0xab65);
		assert.ok(prime.variants.get("serifed").get(small));
	});
}
