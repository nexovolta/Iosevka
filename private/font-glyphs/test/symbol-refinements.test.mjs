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
import * as TypoGeom from "typo-geom";

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
	0x2a33, 0x2a50, 0x2afb, 0x22d8, 0x22d9, 0x2a91, 0x2a92, 0x2a93, 0x2a94,
	0x23b4, 0x23b5, 0x23b6, 0x23dc, 0x23dd, 0x23de, 0x23df, 0x23e0, 0x23e1,
	0x2972, 0x2973, 0x2974, 0x2975, 0x2b41, 0x2b42, 0x2b47, 0x2b48, 0x2b49,
	0x2b4a, 0x2b4b, 0x2b4c, 0x237c, 0x238c, 0x23af, 0x23d0, 0x2976, 0x2978,
	0x2979, 0x297b, 0x2993, 0x2994, 0x2995, 0x2996, 0x239a, 0x23e7, 0x20e2,
	0x29c0, 0x29c1, 0x2e00, 0x2e01, 0x2e02, 0x2e03, 0x2e04, 0x2e05, 0x2e06,
	0x2e07, 0x2e08, 0x2e09, 0x2e0a, 0x2e3f,
	0x2248, 0x2249, 0x224b, 0x2a6f, 0x2b97, 0x3001, 0x3002, 0x3003, 0x301c,
	0x301d, 0x301e, 0x301f, 0x3030, 0x303b, 0x303c, 0x303d,
];

await Geom.Init();

function assertDisjoint(parts, label) {
	for (let i = 0; i < parts.length; i++) {
		for (let j = i + 1; j < parts.length; j++) {
			const overlap = new Geom.BooleanGeometry(
				TypoGeom.Boolean.ClipType.Intersection,
				[
					new Geom.ContourSetGeometry([parts[i]]),
					new Geom.ContourSetGeometry([parts[j]]),
				],
			);
			assert.equal(overlap.toContours().length, 0, `${label} outlines overlap`);
		}
	}
}

function assertNoSelfIntersections(geometry, label) {
	const cross = (a, b, c) =>
		(b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
	for (const contour of geometry.toBezArcs()) {
		const points = [];
		for (const { a, b, c, d } of contour) {
			for (let i = 0; i < 8; i++) {
				const t = i / 8;
				const u = 1 - t;
				points.push({
					x: u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x,
					y: u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y,
				});
			}
		}
		for (let i = 0; i < points.length; i++) {
			for (let j = i + 2; j < points.length; j++) {
				if (i === 0 && j === points.length - 1) continue;
				const a = points[i], b = points[(i + 1) % points.length];
				const c = points[j], d = points[(j + 1) % points.length];
				assert.ok(
					cross(a, b, c) * cross(a, b, d) >= -1e-8 ||
						cross(c, d, a) * cross(c, d, b) >= -1e-8,
					`${label} outline self-intersects`,
				);
			}
		}
	}
}

function assertTildeSpacing(contours) {
	const waveParts = (code, count) => {
		const parts = contours(code);
		assert.equal(parts.length, count, `U+${code.toString(16)} wave count`);
		assertDisjoint(parts, `U+${code.toString(16)} waves`);
		return parts
			.map((points) => {
				const ys = points.map((p) => p.y);
				return (Math.min(...ys) + Math.max(...ys)) / 2;
			})
			.sort((a, b) => a - b);
	};
	const pair = waveParts(0x2248, 2);
	const triple = waveParts(0x224b, 3);
	assert.ok(
		Math.abs((pair[1] - pair[0]) - (triple[1] - triple[0])) < 0.01,
		"pair and triple wave gaps must match",
	);
	assert.ok(
		Math.abs((triple[1] - triple[0]) - (triple[2] - triple[1])) < 0.01,
		"triple wave gaps must match",
	);
}

function triangleContours(contours) {
	return contours.filter((contour) => {
		const points = contour.slice();
		if (
			points.length > 1 &&
			Math.hypot(
				points[0].x - points[points.length - 1].x,
				points[0].y - points[points.length - 1].y,
			) < 0.01
		) points.pop();
		let changed = true;
		while (changed && points.length > 3) {
			changed = false;
			for (let i = 0; i < points.length; i++) {
				const a = points[(i + points.length - 1) % points.length];
				const b = points[i];
				const c = points[(i + 1) % points.length];
				const distance =
					Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) /
					Math.hypot(c.x - a.x, c.y - a.y);
				if (distance < 0.05) {
					points.splice(i, 1);
					changed = true;
					break;
				}
			}
		}
		return points.length === 3;
	});
}

test("wavy punctuation gains ink with weight", () => {
	const codes = [0x301c, 0x3030, 0x303b, 0x303d];
	const areas = new Map(codes.map((code) => [code, []]));
	for (const weight of [120, 420, 920]) {
		const argv = {
			shape: {
				serifs: "sans", spacing: "term", weight, width: 500,
				slope: "upright", slopeAngle: 0,
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
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		for (const code of codes) {
			const contours = glyphStore.queryByUnicode(code).geometry.toContours();
			if (code === 0x303b) {
				const points = contours.flat();
				const ys = points.map((p) => p.y);
				for (const y of [Math.min(...ys), Math.max(...ys)]) {
					const end = points.filter((p) => Math.abs(p.y - y) < 0.001);
					const xs = end.map((p) => p.x);
					assert.ok(
						Math.max(...xs) - Math.min(...xs) > 1,
						"iteration mark must have flat stroke ends",
					);
				}
			}
			const area = contours.reduce((sum, points) => sum + Math.abs(
				points.reduce((s, p, i) => {
					const next = points[(i + 1) % points.length];
					return s + p.x * next.y - next.x * p.y;
				}, 0) / 2,
			), 0);
			areas.get(code).push(area);
		}
	}
	for (const [code, [thin, regular, heavy]] of areas) {
		assert.ok(regular > thin * 1.2, `U+${code.toString(16)} regular must gain ink`);
		assert.ok(heavy > regular * 1.2, `U+${code.toString(16)} heavy must gain ink`);
	}
});

for (const [tilde, width] of [
	["high", 500], ["high", 416], ["high-short", 500],
	["high-tall", 500], ["high-tall", 416], ["compact", 500],
	["compact-short", 500], ["compact-tall", 500], ["compact-tall", 416],
]) {
	test(`stacked ${tilde} tildes stay separate in heavy italic at width ${width}`, () => {
		const argv = {
			shape: {
				serifs: "sans", spacing: "term", weight: 920, width,
				slope: "italic", slopeAngle: 9.4,
			},
			featureControl: { noCvSs: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					tilde,
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const contours = (code) =>
			glyphStore.queryByUnicode(code).geometry.toContours();
		assertTildeSpacing(contours);
		if (tilde.startsWith("compact")) {
			for (const code of [0x2248, 0x224b]) {
				assertNoSelfIntersections(
					glyphStore.queryByUnicode(code).geometry,
					`U+${code.toString(16)}`,
				);
			}
		}
		assertDisjoint(contours(0x3003), "ditto mark");
		assert.equal(
			triangleContours(contours(0x2b97)).length,
			2,
			"italic postal mark must not touch the frame",
		);
		if (width === 416) {
			for (const code of [0x301c, 0x3030, 0x303b, 0x303d]) {
				const glyph = glyphStore.queryByUnicode(code);
				assert.ok(
					contours(code).flat().every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
					`U+${code.toString(16)} exceeds its advance`,
				);
			}
		}
	});
}

for (const [slope, weight] of [
	["upright", 120], ["upright", 420], ["upright", 920],
	["italic", 120], ["italic", 420],
]) {
	test(`compact-short stacked tildes stay intact at ${weight} ${slope}`, () => {
		const argv = {
			shape: {
				serifs: "sans", spacing: "term", weight, width: 500,
				slope, slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					tilde: "compact-short",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const contours = (code) => glyphStore.queryByUnicode(code).geometry.toContours();
		assertTildeSpacing(contours);
		for (const code of [0x2248, 0x224b]) {
			assertNoSelfIntersections(
				glyphStore.queryByUnicode(code).geometry,
				`U+${code.toString(16)}`,
			);
		}
	});
}

for (const spacing of ["term", "quasi-proportional"]) {
	for (const weight of [120, 420, 920]) {
		test(`requested symbols have intact ${spacing} ${weight} geometry`, () => {
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
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			});
			const contours = (code) => {
				const glyph = glyphStore.queryByUnicode(code);
				assert.ok(glyph, `missing U+${code.toString(16)}`);
				const result = glyph.geometry.toContours();
				assert.ok(result.length, `empty U+${code.toString(16)}`);
				assert.ok(
					result
						.flat()
						.every(
							(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
						),
				);
				return result;
			};
			for (const code of codes) contours(code);
			for (const code of [0x3002, 0x3003, 0x301d, 0x301e, 0x301f]) {
				assert.equal(
					contours(code).length,
					2,
					`U+${code.toString(16)} must have two distinct outlines`,
				);
			}
			assertDisjoint(contours(0x3003), "ditto mark");
			assert.equal(
				contours(0x2b97).length,
				4,
				"postal mark must remain separate from the triangular frame",
			);
			const triangles = triangleContours(contours(0x2b97));
			assert.equal(triangles.length, 2, "triangle counter must not be cut by the postal mark");
			const outerTriangle = triangles.sort((a, b) => {
				const width = (points) =>
					Math.max(...points.map((p) => p.x)) -
					Math.min(...points.map((p) => p.x));
				return width(b) - width(a);
			})[0];
			const triangleWidth =
				Math.max(...outerTriangle.map((p) => p.x)) -
				Math.min(...outerTriangle.map((p) => p.x));
			const triangleHeight =
				Math.max(...outerTriangle.map((p) => p.y)) -
				Math.min(...outerTriangle.map((p) => p.y));
			assert.ok(
				Math.abs(triangleHeight / triangleWidth - Math.sqrt(3) / 2) < 0.001,
				"postal frame must be equilateral",
			);
			assert.equal(contours(0x303c).length, 3, "masu mark must retain both triangular counters");
			for (const code of [0x303b, 0x303d]) {
				const parts = contours(code);
				assert.equal(
					parts.length,
					1,
					`U+${code.toString(16)} must have one continuous outline`,
				);
				assert.ok(
					parts[0].length > 12,
					`U+${code.toString(16)} must retain its curves`,
				);
			}
			const bounds = (code) => {
				const points = contours(code).flat();
				return {
					left: Math.min(...points.map((p) => p.x)),
					right: Math.max(...points.map((p) => p.x)),
					bottom: Math.min(...points.map((p) => p.y)),
					top: Math.max(...points.map((p) => p.y)),
				};
			};
			assert.ok(
				bounds(0x301d).left > bounds(0x301e).left,
				"reversed quotation mark must be on the right",
			);
			assert.ok(
				bounds(0x301f).top < bounds(0x301e).bottom,
				"low quotation mark must be below the high one",
			);
			assertTildeSpacing(contours);
			for (const code of [0x2976, 0x2978, 0x2979, 0x297b]) {
				const components = contours(code)
					.map((points) => {
						const ys = points.map((p) => p.y);
						return {
							bottom: Math.min(...ys),
							top: Math.max(...ys),
						};
					})
					.sort((a, b) => b.top - a.top);
				assert.ok(
					components.length >= 2,
					`U+${code.toString(16)} must have separate relation and arrow`,
				);
				const arrowTop = Math.max(
					...components.slice(1).map((component) => component.top),
				);
				const arrowBottom = Math.min(
					...components.slice(1).map((component) => component.bottom),
				);
				const gap = components[0].bottom - arrowTop;
				assert.ok(
					gap > 0 && gap < (components[0].top - arrowBottom) * 0.12,
					`U+${code.toString(16)} relation gap ${gap}`,
				);
			}
			const bracketDependencies = glyphStore
				.queryByUnicode(0x2993)
				.geometry.getDependencies();
			assert.ok(
				bracketDependencies.includes(glyphStore.queryByUnicode(0x28)),
				"arc bracket must reference the parenthesis",
			);
			assert.ok(
				bracketDependencies.includes(glyphStore.queryByUnicode(0x3c)),
				"arc bracket must reference less-than",
			);
			for (const [bracket, paren, relation] of [
				[0x2995, 0x2e28, 0x3e],
				[0x2996, 0x2e29, 0x3c],
			]) {
				const dependencies = glyphStore
					.queryByUnicode(bracket)
					.geometry.getDependencies();
				assert.ok(
					dependencies.includes(glyphStore.queryByUnicode(paren)),
					`U+${bracket.toString(16)} must reference its double parenthesis`,
				);
				assert.ok(
					dependencies.includes(glyphStore.queryByUnicode(relation)),
					`U+${bracket.toString(16)} must reference its relation`,
				);
			}
			assert.equal(
				contours(0x239a).length,
				5,
				"screen frame and three diagonal strokes must remain separated",
			);
			const screenParts = contours(0x239a)
				.map((points) => {
					const xs = points.map((p) => p.x);
					const ys = points.map((p) => p.y);
					return {
						left: Math.min(...xs),
						right: Math.max(...xs),
						bottom: Math.min(...ys),
						top: Math.max(...ys),
					};
				})
				.sort((a, b) => b.top - b.bottom - (a.top - a.bottom));
			const [outerScreen, innerScreen, ...screenStrokes] = screenParts;
			for (const stroke of screenStrokes) {
				assert.ok(
					stroke.top - stroke.bottom >
						(outerScreen.top - outerScreen.bottom) * 0.4,
					"screen stroke is too short",
				);
				assert.ok(
					stroke.left > innerScreen.left &&
						stroke.right < innerScreen.right &&
						stroke.bottom > innerScreen.bottom &&
						stroke.top < innerScreen.top,
					"screen stroke exceeds its frame",
				);
				assert.ok(
					Math.abs(
						stroke.top +
							stroke.bottom -
							(innerScreen.top + innerScreen.bottom),
					) < 2,
					"screen stroke is vertically off-center",
				);
			}
			assert.ok(
				glyphStore
					.queryByUnicode(0x239a)
					.geometry.getDependencies()
					.includes(glyphStore.queryByUnicode(0x2e5d)),
				"clear screen must reference oblique hyphen",
			);
			assert.equal(
				contours(0x20e2).length,
				2,
				"combining screen must retain its outline and counter",
			);
			assert.equal(
				contours(0x23e7).length,
				3,
				"electrical intersection must retain its separate arrow components",
			);
			for (const code of [0x2993, 0x2994, 0x239a, 0x23e7]) {
				const glyph = glyphStore.queryByUnicode(code);
				assert.ok(
					contours(code)
						.flat()
						.every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
					`U+${code.toString(16)} exceeds its advance`,
				);
			}
			const span = (code) => {
				const points = contours(code).flat();
				return [
					Math.max(...points.map((p) => p.x)) -
						Math.min(...points.map((p) => p.x)),
					Math.max(...points.map((p) => p.y)) -
						Math.min(...points.map((p) => p.y)),
				];
			};
			const editorialHeight = span(0x2e00)[1];
			for (const code of [0x2e02, 0x2e03, 0x2e06, 0x2e09, 0x2e0a]) {
				const height = span(code)[1];
				assert.ok(
					Math.abs(height - editorialHeight) < editorialHeight * 0.05,
					`U+${code.toString(16)} height ${height} differs from ${editorialHeight}`,
				);
			}
			for (const code of [0x2e08, 0x2e09, 0x2e0a]) {
				const glyph = glyphStore.queryByUnicode(code);
				assert.ok(
					contours(code)
						.flat()
						.every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
					`U+${code.toString(16)} exceeds its advance`,
				);
			}
			const topStroke = (code) => {
				const ys = [
					...new Set(
						contours(code)
							.flat()
							.map((p) => p.y),
					),
				].sort((a, b) => b - a);
				return ys[0] - ys[1];
			};
			assert.ok(
				Math.abs(topStroke(0x2e00) - topStroke(0x2e06)) < 0.01,
				"substitution and interpolation strokes differ",
			);
			for (const [dotted, base] of [
				[0x2e01, 0x2e00],
				[0x2e04, 0x2e02],
				[0x2e05, 0x2e03],
				[0x2e07, 0x2e06],
			]) {
				const parts = contours(dotted)
					.map((points) => ({
						left: Math.min(...points.map((p) => p.x)),
						right: Math.max(...points.map((p) => p.x)),
						top: Math.max(...points.map((p) => p.y)),
						bottom: Math.min(...points.map((p) => p.y)),
					}))
					.sort(
						(a, b) =>
							(a.right - a.left) * (a.top - a.bottom) -
							(b.right - b.left) * (b.top - b.bottom),
					);
				const dot = parts[0];
				const body = contours(base).flat();
				const dotX = (dot.left + dot.right) / 2;
				assert.ok(
					dotX > Math.min(...body.map((p) => p.x)) &&
						dotX < Math.max(...body.map((p) => p.x)),
					`U+${dotted.toString(16)} dot must be under the arm`,
				);
			}
			for (const code of [0x29c0, 0x29c1]) {
				assert.ok(
					glyphStore
						.queryByUnicode(code)
						.geometry.getDependencies()
						.some((g) => g.identifier === "mathO"),
					`U+${code.toString(16)} must use the common mathematical circle`,
				);
				const reference = span(0x29b6);
				const actual = span(code);
				assert.ok(
					actual.every(
						(value, i) => Math.abs(value - reference[i]) < 0.01,
					),
					`U+${code.toString(16)} ring differs from circled operators`,
				);
			}
			for (const code of [0x2e01, 0x2e04, 0x2e05, 0x2e07, 0x2e08]) {
				assert.ok(
					contours(code).length >= 2,
					`U+${code.toString(16)} must retain a separate dot`,
				);
			}
			const screen = span(0x239a);
			const electrical = span(0x23e7);
			if (spacing === "term") {
				assert.ok(
					screen[0] > 440 && screen[1] > 400,
					`screen is too small: ${screen}`,
				);
				assert.ok(
					electrical[0] > 385 && electrical[1] > 450,
					`electrical intersection is too small: ${electrical}`,
				);
			}
			const multiply = span(0xd7);
			const smash = span(0x2a33);
			for (let i = 0; i < 2; i++) {
				assert.ok(
					smash[i] / multiply[i] > 0.95 &&
						smash[i] / multiply[i] < 1.05,
					`smash ${smash} vs multiply ${multiply}`,
				);
			}
			assert.ok(
				glyphStore
					.queryByUnicode(0x2a50)
					.geometry.getDependencies()
					.includes(glyphStore.queryByUnicode(0x2a33)),
				"closed union must reference smash product",
			);
			for (const code of [0x22d8, 0x22d9, 0x2afb]) {
				assert.equal(
					contours(code).length,
					3,
					`U+${code.toString(16)} must have three strokes`,
				);
			}
			for (const code of [0x2a91, 0x2a92, 0x2a93, 0x2a94]) {
				assert.equal(
					contours(code).length,
					4,
					`U+${code.toString(16)} must have four separated elements`,
				);
			}
			for (const code of [0x2a91, 0x2a92]) {
				const components = contours(code)
					.map((points) => {
						const ys = points.map((p) => p.y);
						return {
							bottom: Math.min(...ys),
							top: Math.max(...ys),
							height: Math.max(...ys) - Math.min(...ys),
						};
					})
					.sort((a, b) => b.top - a.top);
				for (const chevron of components.slice(0, 2)) {
					assert.ok(
						chevron.height < span(code)[1] * 0.3,
						`U+${code.toString(16)} chevron is too tall`,
					);
				}
				const gaps = components
					.slice(0, -1)
					.map(
						(component, i) =>
							component.bottom - components[i + 1].top,
					);
				const baselineGaps =
					weight === 120
						? [136.73, 148.36, 96.98]
						: weight === 420
							? [107.37, 119.16, 65.48]
							: [111.99, 124.28, 68.28];
				assert.ok(
					gaps.every(
						(gap, i) => gap > 0 && gap < baselineGaps[i] * 0.85,
					),
					`U+${code.toString(16)} components are not all closer: ${gaps}`,
				);
				const expectedBarStroke =
					weight === 120 ? 21.158 : weight === 420 ? 57.288 : 59.752;
				for (const bar of components.slice(2)) {
					assert.ok(
						Math.abs(bar.height - expectedBarStroke) < 0.01,
						`U+${code.toString(16)} equal-bar stroke changed`,
					);
				}
			}

			assert.ok(
				span(0x237c)[1] > span(0x22c0)[1] * 0.57,
				"zigzag arrow is too small",
			);
			const zigzag = contours(0x237c).flat();
			assert.ok(
				zigzag.every(
					(p) =>
						p.x >= 0 &&
						p.x <= glyphStore.queryByUnicode(0x237c).advanceWidth,
				),
				"zigzag arrow exceeds its advance",
			);
			for (const [top, bottom] of [
				[0x23b4, 0x23b5],
				[0x23dc, 0x23dd],
				[0x23de, 0x23df],
				[0x23e0, 0x23e1],
			]) {
				const topPoints = contours(top).flat();
				const bottomPoints = contours(bottom).flat();
				const middleY = (points) =>
					(Math.min(...points.map((p) => p.y)) +
						Math.max(...points.map((p) => p.y))) /
					2;
				assert.ok(
					middleY(topPoints) < middleY(bottomPoints),
					`U+${top.toString(16)} must sit below U+${bottom.toString(16)}`,
				);
			}
			const upright = contours(0x28).flat();
			const topParen = contours(0x23dc).flat();
			const uprightMid =
				(Math.min(...upright.map((p) => p.y)) +
					Math.max(...upright.map((p) => p.y))) /
				2;
			const topMid = glyphStore.queryByUnicode(0x23dc).advanceWidth / 2;
			const uprightEdges = upright
				.filter((p) => Math.abs(p.y - uprightMid) < 0.001)
				.map((p) => p.x);
			const topEdges = topParen
				.filter((p) => Math.abs(p.x - topMid) < 0.001)
				.map((p) => p.y);
			assert.ok(
				uprightEdges.length >= 2 && topEdges.length >= 2,
				"parenthesis stroke edges missing",
			);
			const uprightThickness =
				Math.max(...uprightEdges) - Math.min(...uprightEdges);
			const topThickness = Math.max(...topEdges) - Math.min(...topEdges);
			assert.ok(
				Math.abs(uprightThickness - topThickness) < 0.01,
				`parenthesis thickness ${topThickness} != ${uprightThickness}`,
			);
			for (const [source, top] of [
				[0x28, 0x23dc],
				[0x7b, 0x23de],
				[0x3014, 0x23e0],
			]) {
				assert.ok(
					Math.abs(span(source)[0] - span(top)[1]) < 0.01,
					`U+${top.toString(16)} compresses upright stroke geometry`,
				);
			}
			for (const code of [0x23de, 0x23df]) {
				assert.ok(
					glyphStore
						.queryByUnicode(code)
						.geometry.getDependencies()
						.some((g) => g.identifier === "braceLeft.straight"),
					`U+${code.toString(16)} must use the smooth brace construction`,
				);
			}
		});
	}
}

test("arc bracket follows each parenthesis contour", () => {
	const offsets = [];
	for (const paren of ["normal", "large-contour", "flat-arc"]) {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight: 420,
				width: 500,
				slope: "upright",
				slopeAngle: 0,
			},
			featureControl: { noCvSs: true },
			variants: {
				design: {
					paren,
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const leftEdge = (code) =>
			Math.min(
				...glyphStore
					.queryByUnicode(code)
					.geometry.toContours()
					.flat()
					.map((p) => p.x),
			);
		assert.ok(
			leftEdge(0x2993) >= 0,
			`${paren} arc bracket exceeds its advance`,
		);
		offsets.push(leftEdge(0x2993) - 0.94 * leftEdge(0x28));
	}
	assert.ok(
		Math.max(...offsets) - Math.min(...offsets) < 1,
		`arc bracket alignment varies: ${offsets}`,
	);
});

test("double arc brackets build in semilight italic", () => {
	const argv = {
		shape: {
			serifs: "sans",
			spacing: "term",
			weight: 300,
			width: 500,
			slope: "italic",
			slopeAngle: 9.4,
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
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: () => true,
		glyphIsNeeded: () => true,
	});
	for (const [bracket, paren, relation] of [
		[0x2995, 0x2e28, 0x3e],
		[0x2996, 0x2e29, 0x3c],
	]) {
		const glyph = glyphStore.queryByUnicode(bracket);
		const points = glyph.geometry.toContours().flat();
		assert.ok(
			points.length &&
				points.every(
					(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
				),
		);
		const dependencies = glyph.geometry.getDependencies();
		assert.ok(dependencies.includes(glyphStore.queryByUnicode(paren)));
		assert.ok(dependencies.includes(glyphStore.queryByUnicode(relation)));
	}
});
