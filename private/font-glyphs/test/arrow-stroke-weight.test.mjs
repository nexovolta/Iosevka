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
const readParams = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(
		readParams,
	),
);
const variantData = readParams("variants");
await Geom.Init();

for (const spacing of ["term", "quasi-proportional"]) {
	for (const weight of [120, 420, 920]) {
		test(`horizontal-tail arrow uses the zigzag operator stroke: ${spacing} ${weight}`, () => {
			const argv = {
				shape: {
					serifs: "sans",
					spacing,
					weight,
					width: 500,
					slope: "upright",
					slopeAngle: 0,
				},
				featureControl: { noCvSs: true },
				variants: {
					design: {
						"capital-latin-gamma": "serifless",
						"latin-gamma": "serifless",
					},
				},
			};
			const para = init(data, argv);
			Variant.apply(variantData, para, argv);
			const filter = {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			};
			const { glyphStore } = buildGlyphs(para, filter);
			for (const code of [0x2b5c, 0x2b5d]) {
				const points = glyphStore
					.queryByUnicode(code)
					.geometry.toContours()
					.flat();
				const left = Math.min(...points.map((p) => p.x));
				const ys = points
					.filter((p) => Math.abs(p.x - left) < 0.001)
					.map((p) => p.y);
				const actual = Math.max(...ys) - Math.min(...ys);
				const expected = calculateMetrics(para).OperatorStroke;
				assert.ok(
					Math.abs(actual - expected) < 0.01,
					`U+${code.toString(16)}: ${actual} != ${expected}`,
				);
			}
		});
	}
}
