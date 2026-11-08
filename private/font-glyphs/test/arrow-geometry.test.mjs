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
const readParams = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(
		readParams,
	),
);
const variantData = readParams("variants");
const codes = [
	0x2b40, 0x2b41, 0x2b42, 0x2b43, 0x2b44, 0x2b47, 0x2b48, 0x2b49, 0x2b4a,
	0x2b4b, 0x2b4c, 0x2b4d, 0x2b4e, 0x2b4f, 0x2b56, 0x2b57, 0x2b5a, 0x2b5b,
	0x2b5c, 0x2b5d, 0x2b5e, 0x2b5f, 0x2b76, 0x2b77, 0x2b78, 0x2b79, 0x2b88,
	0x2b89, 0x2b8a, 0x2b8b, 0x2b98, 0x2b99, 0x2b9a, 0x2b9b, 0x2b9c, 0x2b9d,
	0x2b9e, 0x2b9f, 0x2ba8, 0x2ba9, 0x2baa, 0x2bab, 0x2bac, 0x2bad, 0x2bae,
	0x2baf, 0x2971, 0x2972, 0x2973, 0x2974, 0x2975, 0x2977, 0x297a,
];
const topology = [
	[1, [0x2b43, 0x2b44, 0x2977, 0x297a, 0x2b88, 0x2b89, 0x2b8a, 0x2b8b]],
	[1, [0x2ba8, 0x2ba9, 0x2baa, 0x2bab, 0x2bac, 0x2bad, 0x2bae, 0x2baf]],
	[2, [0x2b98, 0x2b99, 0x2b9a, 0x2b9b]],
	[3, [0x2b76, 0x2b77, 0x2b78, 0x2b79]],
	[4, [0x2b56, 0x2b57]],
];
const headSizes = new Map();
const ringWidths = new Map();

function horizontalSpan(contour, y) {
	const xs = [];
	for (let i = 0; i < contour.length; i++) {
		const a = contour[i];
		const b = contour[(i + 1) % contour.length];
		if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
			xs.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
		}
	}
	assert.equal(xs.length, 2, `expected one shaft at y=${y}`);
	return Math.abs(xs[1] - xs[0]);
}

await Geom.Init();

for (const [spacing, label, weight] of ["term", "quasi-proportional"].flatMap(
	(spacing) =>
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
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
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
				assert.ok(
					contour.length >= 3,
					`${name} has a degenerate contour`,
				);
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
			for (const code of [0x2b56, 0x2b57]) {
				const radii = outlines
					.get(code)
					.map(
						(contour) =>
							(Math.max(...contour.map((p) => p.y)) -
								Math.min(...contour.map((p) => p.y))) /
							2,
					)
					.sort((a, b) => b - a);
				const outer = radii[0] - radii[1];
				const gap = radii[1] - radii[2];
				const inner = radii[2] - radii[3];
				assert.ok(
					outer > 0 && gap > 0 && inner > 0 && radii[3] > 0,
					`U+${code.toString(16)} must retain both rings and their counters`,
				);
				ringWidths.set(`${spacing}-${weight}-${code}`, outer);
			}
		}
		const boundsOf = (code) => {
			const points = outlines.get(code).flat();
			return [
				Math.min(...points.map((p) => p.x)),
				Math.min(...points.map((p) => p.y)),
				Math.max(...points.map((p) => p.x)),
				Math.max(...points.map((p) => p.y)),
			];
		};
		for (const code of [
			0x2ba8, 0x2ba9, 0x2baa, 0x2bab, 0x2bac, 0x2bad, 0x2bae, 0x2baf,
		]) {
			const [left, bottom, right, top] = boundsOf(code);
			const glyph = glyphStore.queryByUnicode(code);
			assert.ok(
				left >= 0 && right <= glyph.advanceWidth,
				`U+${code.toString(16).toUpperCase()} exceeds its advance`,
			);
			assert.ok(
				bottom >= fontMetrics.hhea.descender &&
					top <= fontMetrics.hhea.ascender,
				`U+${code.toString(16).toUpperCase()} exceeds line metrics`,
			);
			assert.ok(
				code < 0x2bac
					? right - left > top - bottom
					: top - bottom > right - left,
				`U+${code.toString(16).toUpperCase()} orientation`,
			);
		}
		const arrow = outlines.get(0x2ba8).flat();
		const tailTop = Math.max(...arrow.map((p) => p.y));
		const tailPoints = arrow.filter((p) => Math.abs(p.y - tailTop) < 0.001);
		const tailWidth =
			Math.max(...tailPoints.map((p) => p.x)) -
			Math.min(...tailPoints.map((p) => p.x));
		const arrowWidth = boundsOf(0x2ba8)[2] - boundsOf(0x2ba8)[0];
		assert.ok(
			tailWidth >= arrowWidth * 0.03,
			"U+2BA8 tail must have a flat, nonzero-width cap",
		);
		const diagonalHead = glyphStore
			.queryByUnicode(0x2b66)
			.geometry.toContours()[0];
		const compositeHead = outlines.get(0x2b42)[0];
		headSizes.set(`${spacing}-${weight}`, {
			curved: arrow[1].y - arrow.at(-1).y,
			diagonal: Math.hypot(
				diagonalHead[1].x - diagonalHead[0].x,
				diagonalHead[1].y - diagonalHead[0].y,
			),
			composite:
				Math.max(...compositeHead.map((p) => p.y)) -
				Math.min(...compositeHead.map((p) => p.y)),
		});
		for (const [left, right] of [
			[0x2ba8, 0x2ba9],
			[0x2baa, 0x2bab],
			[0x2bac, 0x2bad],
			[0x2bae, 0x2baf],
		]) {
			const a = boundsOf(left);
			const b = boundsOf(right);
			const advance = glyphStore.queryByUnicode(left).advanceWidth;
			for (const delta of [
				a[0] + b[2] - advance,
				a[2] + b[0] - advance,
				a[1] - b[1],
				a[3] - b[3],
			]) {
				assert.ok(
					Math.abs(delta) < 0.001,
					`U+${left.toString(16)} and U+${right.toString(16)} must mirror`,
				);
			}
		}
		for (const code of [0x2b5a, 0x2b5b, 0x2b5c, 0x2b5d, 0x2b5e, 0x2b5f]) {
			assert.equal(
				outlines.get(code).length,
				1,
				`U+${code.toString(16).toUpperCase()} must have one connected outline without holes: ${JSON.stringify(outlines.get(code).map((contour) => [Math.min(...contour.map((p) => p.x)), Math.min(...contour.map((p) => p.y)), Math.max(...contour.map((p) => p.x)), Math.max(...contour.map((p) => p.y))]))}`,
			);
			const glyph = glyphStore.queryByUnicode(code);
			const points = outlines.get(code).flat();
			assert.ok(
				points.every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
				`U+${code.toString(16).toUpperCase()} exceeds its advance: ${Math.min(...points.map((p) => p.x))}..${Math.max(...points.map((p) => p.x))}, advance ${glyph.advanceWidth}`,
			);
			const height =
				Math.max(...points.map((p) => p.y)) -
				Math.min(...points.map((p) => p.y));
			const reference = outlines.get(0x2b4d).flat();
			const referenceHeight =
				Math.max(...reference.map((p) => p.y)) -
				Math.min(...reference.map((p) => p.y));
			assert.ok(
				height >= referenceHeight * 0.85,
				`U+${code.toString(16).toUpperCase()} is too small`,
			);
			const refY =
				Math.min(...reference.map((p) => p.y)) + referenceHeight * 0.82;
			const shaftFraction =
				code === 0x2b5a ? 0.3 : code === 0x2b5b ? 0.4 : 0.5;
			const shaftY =
				Math.min(...points.map((p) => p.y)) + height * shaftFraction;
			const refSpan = horizontalSpan(outlines.get(0x2b4d)[0], refY);
			const shaftSpan = horizontalSpan(outlines.get(code)[0], shaftY);
			assert.ok(
				shaftSpan >= refSpan * 0.85 && shaftSpan <= refSpan * 1.3,
				`U+${code.toString(16).toUpperCase()} shaft ${shaftSpan} does not match zigzag ${refSpan}`,
			);
		}
		for (const code of [0x2b42, 0x2b48, 0x2b4a, 0x2975]) {
			const waves = outlines.get(code).slice(-2);
			const ends = waves
				.map((contour) => {
					const left = Math.min(...contour.map((p) => p.x));
					const ys = contour
						.filter((p) => Math.abs(p.x - left) < 0.001)
						.map((p) => p.y);
					return [Math.min(...ys), Math.max(...ys)];
				})
				.sort((a, b) => b[0] - a[0]);
			const gap = ends[0][0] - ends[1][1];
			const thickness = ends[0][1] - ends[0][0];
			assert.ok(
				Math.abs(gap - thickness) < 0.001,
				`U+${code.toString(16).toUpperCase()} tilde spacing: ${gap} / ${thickness}`,
			);
		}
		for (const code of [0x2b76, 0x2b77, 0x2b78, 0x2b79]) {
			const source = 0x2b66 + (code - 0x2b76);
			const glyph = glyphStore.queryByUnicode(code);
			const allPoints = outlines.get(code).flat();
			assert.ok(
				allPoints.every(
					(point) => point.x >= 0 && point.x <= glyph.advanceWidth,
				),
				`U+${code.toString(16).toUpperCase()} outline exceeds advance: ${Math.min(...allPoints.map((p) => p.x))}..${Math.max(...allPoints.map((p) => p.x))}, advance ${glyph.advanceWidth}`,
			);
			assert.ok(
				glyph.geometry
					.getDependencies()
					.includes(glyphStore.queryByUnicode(source)),
				`U+${code.toString(16).toUpperCase()} must use U+${source.toString(16).toUpperCase()}`,
			);
			assert.deepEqual(
				outlines.get(code).slice(0, -1),
				glyphStore.queryByUnicode(source).geometry.toContours(),
				`U+${code.toString(16).toUpperCase()} must retain the full base arrow`,
			);
			const bar = outlines.get(code).at(-1);
			const referenceBar = glyphStore
				.queryByUnicode(0x2b71)
				.geometry.toContours()
				.at(-1);
			const widthOf = (contour) =>
				Math.max(...contour.map((p) => p.x)) -
				Math.min(...contour.map((p) => p.x));
			assert.ok(
				Math.abs(
					widthOf(bar) -
						Math.min(
							widthOf(referenceBar),
							glyph.advanceWidth * 0.94,
						),
				) < 0.01,
				`U+${code.toString(16).toUpperCase()} bar must match U+2B71`,
			);
			assert.ok(
				bar.every(
					(point) => point.x >= 0 && point.x <= glyph.advanceWidth,
				),
				`U+${code.toString(16).toUpperCase()} bar must fit within its advance`,
			);
			assert.ok(
				bar.every(
					(point) =>
						point.y >= fontMetrics.hhea.descender &&
						point.y <= fontMetrics.hhea.ascender,
				),
				`U+${code.toString(16).toUpperCase()} bar must fit within the line metrics: ${JSON.stringify(bar.map((p) => p.y))}, ${fontMetrics.hhea.descender}..${fontMetrics.hhea.ascender}`,
			);
			const bounds = outlines
				.get(code)
				.map((contour) => [
					Math.min(...contour.map((p) => p.y)),
					Math.max(...contour.map((p) => p.y)),
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

test("double-ring outer strokes thicken from Thin through Heavy", () => {
	for (const spacing of ["term", "quasi-proportional"]) {
		for (const code of [0x2b56, 0x2b57]) {
			const [thin, regular, heavy] = [120, 420, 920].map((weight) =>
				ringWidths.get(`${spacing}-${weight}-${code}`),
			);
			assert.ok(
				regular > thin * 1.05 && heavy > regular * 1.05,
				`U+${code.toString(16)} ${spacing}: ${thin}, ${regular}, ${heavy}`,
			);
		}
	}
});

test("requested arrowheads grow from Thin through Heavy", () => {
	for (const spacing of ["term", "quasi-proportional"]) {
		for (const kind of ["curved", "diagonal", "composite"]) {
			const sizes = [120, 420, 920].map(
				(weight) => headSizes.get(`${spacing}-${weight}`)[kind],
			);
			assert.ok(
				sizes[0] < sizes[1] && sizes[1] < sizes[2],
				`${spacing} ${kind}: ${sizes}`,
			);
		}
	}
});
