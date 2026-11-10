import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import * as Caching from "@iosevka/geometry-cache";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";
import * as hb from "harfbuzzjs";

import { buildFont } from "../../font/src/build-font/index.mjs";
import { buildTTF } from "../../font/src/font-io/index.mjs";
import { getParametersT } from "../../font/src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");

await Geom.Init();
for (const [weight, slope] of [[120, "upright"], [420, "upright"], [920, "upright"], [920, "italic"]]) {
	test(`capital AE and OE E-bar inheritance at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: {
				"capital-a": "square-bottom-top-serifed",
				"capital-e": "diagonal-crossbar-rising-top-left-serifed-capped",
				"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
			} },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const byName = name => glyphStore.queryByNameEnsured(name);
		const contours = glyph => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const prime = para.variants.primes.get("capital-e");

		for (const [key, variant] of prime.variants) {
			for (const component of ["AE/E", "OE/E", "smcpAE/smcpE", "smcpOE/smcpE"]) {
				const base = byName(component);
				const name = variant.get(base);
				assert.ok(name, `${key}: ${component} has no variant`);
				const shape = contours(byName(name));
				assert.ok(shape.length && shape.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${key}: ${name}`);
			}

			for (const name of ["AE", "OE", "smcpAE", "smcpOE"]) {
				const base = byName(name);
				const target = variant.get(base);
				assert.ok(target, `${key}: ${name} has no variant`);
				assert.ok(contours(byName(target)).length, `${key}: empty ${target}`);
			}
		}

		for (const component of ["AE/E", "OE/E", "smcpAE/smcpE", "smcpOE/smcpE"]) {
			const base = byName(component);
			const shapes = ["serifless", "diagonal-crossbar-rising", "diagonal-crossbar-falling"].map(key =>
				JSON.stringify(contours(byName(prime.variants.get(key).get(base)))));
			assert.equal(new Set(shapes).size, 3, `${component}: bar slopes must differ`);
		}
		const selected = prime.variants.get("diagonal-crossbar-rising-top-left-serifed-capped");
		for (const name of ["AE", "OE", "smcpAE", "smcpOE"]) {
			const base = byName(name);
			assert.deepEqual(contours(base), contours(byName(selected.get(base))), `${name}: selected variant`);
		}
	});
}

test("AE and OE diagonal bars build and shape in a TTF", async () => {
	const makePara = await getParametersT({ paramsDir });
	const text = "MAÆŒᴁɶꜸꜺꜼ";
	const argv = {
		shape: { serifs: "sans", spacing: "quasi-proportional", weight: 920, width: 500, slope: "italic", slopeAngle: 9.4 },
		menu: { family: "AE OE QA", version: "34.9.0", width: 5, slope: "italic", weight: 400 },
		featureControl: { noCvSs: false },
		variants: { design: {
			"capital-a": "square-bottom-top-serifed",
			"capital-e": "diagonal-crossbar-falling-serifed-capped",
			"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
		} },
		subset: { include: { text } },
	};
	const cache = await Caching.load(null, "34.9.0", "capital-ae-oe-bars-test");
	const { font } = await buildFont(makePara(argv), cache);
	const hbFont = new hb.Font(new hb.Face(new hb.Blob(buildTTF(font)), 0));
	const buffer = new hb.Buffer();
	buffer.addText(text);
	buffer.guessSegmentProperties();
	hb.shape(hbFont, buffer);
	const glyphs = buffer.getGlyphInfosAndPositions();
	assert.equal(glyphs.length, Array.from(text).length);
	assert.ok(glyphs.every(g => g.codepoint !== 0 && g.xAdvance > 0));
	for (const glyph of glyphs.slice(-3)) assert.equal(glyph.xAdvance, glyphs[0].xAdvance);
});
