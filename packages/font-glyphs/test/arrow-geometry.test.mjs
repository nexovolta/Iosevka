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
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(readParams),
);
const variantData = readParams("variants");
const codes = [
	0x2b40, 0x2b41, 0x2b42, 0x2b43, 0x2b44, 0x2b47, 0x2b48, 0x2b49, 0x2b4a, 0x2b4b, 0x2b4c, 0x2b4e,
	0x2b4f, 0x2b56, 0x2b57, 0x2b5a, 0x2b5b, 0x2b5c, 0x2b5d, 0x2b5e, 0x2b5f, 0x2b76, 0x2b77, 0x2b78,
	0x2b79, 0x2b88, 0x2b89, 0x2b8a, 0x2b8b, 0x2b98, 0x2b99, 0x2b9a, 0x2b9b, 0x2b9c, 0x2b9d, 0x2b9e,
	0x2b9f, 0x2971, 0x2972, 0x2973, 0x2974, 0x2975, 0x2977, 0x297a,
];
const topology = [
	[1, [0x2b43, 0x2b44, 0x2977, 0x297a, 0x2b88, 0x2b89, 0x2b8a, 0x2b8b]],
	[2, [0x2b98, 0x2b99, 0x2b9a, 0x2b9b]],
	[3, [0x2b76, 0x2b77, 0x2b78, 0x2b79]],
	[4, [0x2b56, 0x2b57]],
];

await Geom.Init();

for (const [spacing, label, weight] of ["term", "quasi-proportional"].flatMap(spacing =>
	[
		["Thin", 120],
		["Regular", 420],
		["Heavy", 920],
	].map(([label, weight]) => [spacing, label, weight]),
)) {
	test(`supplemental arrows have finite, intact ${spacing} ${label} outlines`, () => {
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
				design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" },
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const filter = { blockIsNeeded: () => true, glyphIsNeeded: () => true };
		const { glyphStore, fontMetrics } = buildGlyphs(para, filter);
		const outlines = new Map();
		for (const code of codes) {
			const name = `U+${code.toString(16).toUpperCase()}`;
			const glyph = glyphStore.queryByUnicode(code);
			assert.ok(glyph, `${name} is missing`);
			const contours = glyph.geometry.toContours();
			assert.ok(contours.length, `${name} is empty`);
			for (const contour of contours) {
				assert.ok(contour.length >= 3, `${name} has a degenerate contour`);
				for (const point of contour) {
					assert.ok(
						Number.isFinite(point.x) && Number.isFinite(point.y),
						`${name} has invalid coordinates`,
					);
				}
			}
			outlines.set(code, contours);
		}
		for (const [count, group] of topology) {
			for (const code of group) {
				assert.equal(
					outlines.get(code).length,
					count,
					`U+${code.toString(16).toUpperCase()} topology`,
				);
			}
		}
		for (const code of [0x2b5a, 0x2b5b, 0x2b5c, 0x2b5d, 0x2b5e, 0x2b5f]) {
			assert.equal(
				outlines.get(code).length,
				1,
				`U+${code.toString(16).toUpperCase()} must have one connected outline without holes`,
			);
		}
		for (const code of [0x2b76, 0x2b77, 0x2b78, 0x2b79]) {
			const source = 0x2b66 + (code - 0x2b76);
			const glyph = glyphStore.queryByUnicode(code);
			assert.ok(
				glyph.geometry.getDependencies().includes(glyphStore.queryByUnicode(source)),
				`U+${code.toString(16).toUpperCase()} must use U+${source.toString(16).toUpperCase()}`,
			);
			assert.deepEqual(
				outlines.get(code).slice(0, -1),
				glyphStore.queryByUnicode(source).geometry.toContours(),
				`U+${code.toString(16).toUpperCase()} must retain the full base arrow`,
			);
			const bar = outlines.get(code).at(-1);
			assert.ok(
				bar.every(point => point.x >= 0 && point.x <= glyph.advanceWidth),
				`U+${code.toString(16).toUpperCase()} bar must fit within its advance`,
			);
			assert.ok(
				bar.every(
					point =>
						point.y >= fontMetrics.hhea.descender && point.y <= fontMetrics.hhea.ascender,
				),
				`U+${code.toString(16).toUpperCase()} bar must fit within the line metrics: ${JSON.stringify(bar.map(p => p.y))}, ${fontMetrics.hhea.descender}..${fontMetrics.hhea.ascender}`,
			);
			const bounds = outlines
				.get(code)
				.map(contour => [
					Math.min(...contour.map(p => p.y)),
					Math.max(...contour.map(p => p.y)),
				])
				.sort((a, b) => a[0] - b[0]);
			const separated =
				code <= 0x2b77
					? Math.max(bounds[0][1], bounds[1][1]) < bounds[2][0]
					: bounds[0][1] < Math.min(bounds[1][0], bounds[2][0]);
			assert.ok(
				separated,
				`U+${code.toString(16).toUpperCase()} bar must not touch the arrow: ${JSON.stringify(bounds)}`,
			);
		}
	});
}
