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

for (const noCvSs of [false, true]) {
	test(`half a inherits both diagonal bar directions (noCvSs=${noCvSs})`, () => {
		const contours = [];
		for (const suffix of ["", "-diagonal-bar-rising", "-diagonal-bar-falling"]) {
			const argv = {
				shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "italic", slopeAngle: 9.4 },
				featureControl: { noCvSs },
				variants: { design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					a: `double-storey-serifless${suffix}`,
				} },
			};
			const para = init(data, argv);
			Variant.apply(variantData, para, argv);
			const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
			if (!noCvSs && !suffix) {
				const variants = para.variants.primes.get("a").variants.values();
				for (const variant of variants) {
					const name = `aHalf.${variant.selector.aHalf}`;
					assert.ok(glyphStore.queryByNameEnsured(name).geometry.toContours().length, `${variant.key}: ${name}`);
					const swashName = `aSwash.${variant.selector.a}`;
					assert.ok(glyphStore.queryByNameEnsured(swashName).geometry.toContours().length, `${variant.key}: ${swashName}`);
				}
			}
			const glyph = glyphStore.queryByUnicode(0x1df5a);
			const shape = glyph.geometry.toContours();
			assert.ok(shape.length);
			assert.ok(shape.every(c => c.length >= 3 && c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
			contours.push(JSON.stringify(shape));
		}
		assert.equal(new Set(contours).size, 3);
	});
}

	test("swash a follows the selected a, including diagonal bars and single-storey forms", () => {
		const contours = [];
		for (const choice of ["double-storey-serifless", "double-storey-serifless-diagonal-bar-rising", "single-storey-serifless"]) {
			const argv = {
				shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "italic", slopeAngle: 9.4 },
				featureControl: { noCvSs: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", a: choice } },
			};
			const para = init(data, argv);
			Variant.apply(variantData, para, argv);
			const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
			const selected = para.variants.primes.get("a").variants.get(choice).selector.a;
			assert.deepEqual(
				glyphStore.queryByUnicode(0x1df69).geometry.toContours(),
				glyphStore.queryByNameEnsured(`aSwash.${selected}`).geometry.toContours(),
			);
			contours.push(JSON.stringify(glyphStore.queryByUnicode(0x1df69).geometry.toContours()));
		}
		assert.equal(new Set(contours).size, 3);
	});
