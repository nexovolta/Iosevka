import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const readParams = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(readParams),
);
const variantData = readParams("variants");

await Geom.Init();

function build(spacing, weight, slope, capitalS = "serifless") {
	const argv = {
		shape: {
			serifs: "sans", spacing, weight, width: 500, slope,
			slopeAngle: slope === "italic" ? 9.4 : 0,
		},
		featureControl: { noCvSs: false },
		variants: { design: {
			"capital-s": capitalS, "capital-latin-gamma": "serifless", "latin-gamma": "serifless",
		} },
	};
	const para = init(data, argv);
	Variant.apply(variantData, para, argv);
	return { para, ...buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true }) };
}

for (const spacing of ["term", "quasi-proportional"]) {
	for (const weight of [120, 420, 920]) {
		for (const slope of ["upright", "italic"]) {
			test(`currency symbols have intact ${spacing} ${weight} ${slope} outlines`, () => {
				const { para, glyphStore } = build(spacing, weight, slope);
				const contours = code => {
					const glyph = glyphStore.queryByUnicode(code);
					assert.ok(glyph, `missing U+${code.toString(16)}`);
					const result = glyph.geometry.toContours();
					assert.ok(result.length);
					assert.ok(result.every(c => c.length >= 3 && c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
					return result;
				};
				const penny = contours(0x20b0);
				const spesmilo = contours(0x20b7);
				const nordic = contours(0x20bb);
				assert.equal(penny.length, 2, "penny must have one joined outline and one loop counter");
				assert.ok(spesmilo.length >= 3, "spesmilo must retain the m counters");
				assert.equal(nordic.length, 3, "nordic mark must have one joined outline and two counters");
				assert.ok(Math.min(...penny.flat().map(p => p.y)) < calculateMetrics(para).Descender);
				if (slope === "upright") {
					for (const code of [0x20b0, 0x20b7, 0x20bb]) {
						const glyph = glyphStore.queryByUnicode(code);
						assert.ok(contours(code).flat().every(p => p.x >= 0 && p.x <= glyph.advanceWidth), `U+${code.toString(16)} exceeds its advance`);
					}
				}
			});
		}
	}
}

test("spesmilo follows each capital S top style without changing the other currencies", () => {
	const variants = [
		["serifless", "serifless"],
		["flat-hooked", "flatHook"],
		["corner-hooked", "cornerHook"],
		["unilateral-serifed", "unilateralSerifed"],
		["unilateral-inward-serifed", "unilateralInwardSerifed"],
	];
	const shapes = [];
	let independent;
	for (const [option, suffix] of variants) {
		const { glyphStore } = build("term", 420, "upright", option);
		const actual = glyphStore.queryByUnicode(0x20b7).geometry.toContours();
		const expected = glyphStore.queryByNameEnsured(`currency/spesmiloSign.${suffix}`).geometry.toContours();
		assert.deepEqual(actual, expected, `spesmilo does not follow capital S ${option}`);
		const other = [0x20b0, 0x20bb].map(code => glyphStore.queryByUnicode(code).geometry.toContours());
		if (independent) assert.deepEqual(other, independent);
		else independent = other;
		for (const previous of shapes) assert.notDeepEqual(actual, previous, `top style ${option} is not distinct`);
		shapes.push(actual);
	}
});
