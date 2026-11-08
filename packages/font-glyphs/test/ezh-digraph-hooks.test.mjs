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
const variantData = read("variants");
const hooks = ["serifless", "serifed", "inward-serifed", "flat-hooked", "corner-hooked"];
await Geom.Init();

for (const [weight, slope] of [[120, "upright"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`ezh digraph hook selectors at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "lower-ezh": "straight-flat-hooked-serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const byName = name => glyphStore.queryByNameEnsured(name);
		const outline = glyph => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const prime = para.variants.primes.get("lower-ezh");
		for (const name of ["lyogh", "lyogh/phoneticRight"]) {
			const original = byName(`${name}.straightSerifless.serifless`);
			const unchanged = byName(`${name}/hook.straightSerifless.serifless.serifless`);
			assert.deepEqual(outline(unchanged), outline(original), `${name}: default shape changed`);
			assert.equal(unchanged.advanceWidth, original.advanceWidth, `${name}: default component width changed`);
			assert.deepEqual(outline(byName(name)), outline(byName(`${name}/hook.straightSerifless.flatHook`)), `${name}: selected hook not applied`);
		}

		assert.deepEqual(outline(byName("ezh/phoneticRight")), outline(byName("ezh/phoneticRight.straightSerifless.flatHook")));
		for (const name of ["ezh", "lyogh", "ezh/phoneticRight", "lyogh/phoneticRight"]) {
			const glyph = byName(name);
			const shapes = hooks.map(hook => {
				const variantName = prime.variants.get(`straight-${hook}-serifless`).get(glyph);
				assert.ok(variantName, `${name}: missing ${hook}`);
				const contours = outline(byName(variantName));
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), variantName);
				return JSON.stringify(contours);
			});
			assert.equal(new Set(shapes).size, hooks.length, `${name}: hook choices must remain distinct`);
		}
		for (const cp of [0x1ba, 0xa763, 0x1df05, 0x1df18]) {
			const glyph = glyphStore.queryByUnicode(cp);
			const shapes = hooks.map(hook => {
				const name = prime.variants.get(`straight-${hook}-serifless`).get(glyph);
				return JSON.stringify(outline(name ? byName(name) : glyph));
			});
			assert.equal(new Set(shapes).size, 1, `U+${cp.toString(16)}: attached hook or loop must retain its rounded terminal`);
		}
		for (const cp of [0x292, 0x1ba, 0xa763, 0x26e, 0x1df05, 0x1d9a, 0x1df18]) {
			assert.ok(outline(glyphStore.queryByUnicode(cp)).length, `U+${cp.toString(16)}`);
		}
	});
}

test("ezh hooks preserve independent z body and l top choices", () => {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		featureControl: { noCvSs: false },
		variants: { design: { z: "cursive", l: "hooky", "lower-ezh": "straight-flat-hooked-serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
	};
	const para = init(data, argv);
	Variant.apply(variantData, para, argv);
	const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
	const outline = name => {
		const glyph = glyphStore.queryByNameEnsured(name);
		return new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
	};
	assert.deepEqual(outline("ezh/phoneticRight"), outline("ezh/phoneticRight.cursive.flatHook"));
	for (const name of ["lyogh", "lyogh/phoneticRight"]) {
		assert.deepEqual(outline(name), outline(`${name}/hook.cursive.flatHook.hooky`));
	}
});
