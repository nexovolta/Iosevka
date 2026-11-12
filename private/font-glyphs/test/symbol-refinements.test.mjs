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
const resizedCjkCodes = [
	0x3001, 0x3002, 0x3003, 0x3012, 0x3013, 0x301c, 0x301d,
	0x301e, 0x301f, 0x3030, 0x3036, 0x303b, 0x303c, 0x303d, 0x303f,
];
const enlargedCjkHeights = [
	[0x3001, 366], [0x3002, 159], [0x3003, 260], [0x3012, 444],
	[0x3013, 464], [0x301c, 148], [0x3030, 94], [0x3036, 358],
	[0x303b, 624], [0x303c, 468], [0x303d, 426], [0x303f, 468],
];
const codes = [
	0x2a33, 0x2a50, 0x2afb, 0x22d8, 0x22d9, 0x2a91, 0x2a92, 0x2a93, 0x2a94,
	0x23b4, 0x23b5, 0x23b6, 0x23dc, 0x23dd, 0x23de, 0x23df, 0x23e0, 0x23e1,
	0x2972, 0x2973, 0x2974, 0x2975, 0x2b41, 0x2b42, 0x2b47, 0x2b48, 0x2b49,
	0x2b4a, 0x2b4b, 0x2b4c, 0x237c, 0x238c, 0x23af, 0x23d0, 0x2976, 0x2978,
	0x237b, 0x2979, 0x297b, 0x2993, 0x2994, 0x2995, 0x2996, 0x239a, 0x23e7, 0x20e2,
	0x29c0, 0x29c1, 0x2e00, 0x2e01, 0x2e02, 0x2e03, 0x2e04, 0x2e05, 0x2e06,
	0x2e07, 0x2e08, 0x2e09, 0x2e0a, 0x2e3f,
	0x2248, 0x2249, 0x224b, 0x2a6f, 0x2a79, 0x2a7a, 0x2b97, 0x3001, 0x3002, 0x3003, 0x301c,
	0x301d, 0x301e, 0x301f, 0x3030, 0x303b, 0x303c, 0x303d, 0x303f,
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

function geometryExtent(glyph, axis) {
	const values = [];
	for (const contour of glyph.geometry.toBezArcs()) {
		for (const arc of contour) {
			for (let i = 0; i <= 24; i++) values.push(arc.eval(i / 24)[axis]);
		}
	}
	return Math.max(...values) - Math.min(...values);
}

function assertCjkVerticalFit(glyph, para, code) {
	const bottom = Math.round(para.descender ?? (para.xHeight - para.ascender));
	const top = Math.round(para.ascender);
	for (const contour of glyph.geometry.toBezArcs()) {
		for (const arc of contour) {
			for (let i = 0; i <= 24; i++) {
				const y = arc.eval(i / 24).y;
				assert.ok(y >= bottom - 0.1 && y <= top + 0.1, `U+${code.toString(16)} exceeds vertical metrics`);
			}
		}
	}
}

function assertSmoothWave(geometry) {
	const points = geometry.toBezArcs()[0].flatMap((arc) =>
		Array.from({ length: 16 }, (_, i) => arc.eval(i / 16)),
	);
	const xs = points.map((p) => p.x);
	const left = Math.min(...xs);
	const right = Math.max(...xs);
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		if (p.x < left + (right - left) * 0.15 || p.x > right - (right - left) * 0.15) continue;
		let a = i, b = i;
		do { a = (a + points.length - 1) % points.length; }
		while (a !== i && Math.hypot(points[a].x - p.x, points[a].y - p.y) < 4);
		do { b = (b + 1) % points.length; }
		while (b !== i && Math.hypot(points[b].x - p.x, points[b].y - p.y) < 4);
		const ux = p.x - points[a].x, uy = p.y - points[a].y;
		const vx = points[b].x - p.x, vy = points[b].y - p.y;
		assert.ok(
			ux * vx + uy * vy >= Math.SQRT1_2 * Math.hypot(ux, uy) * Math.hypot(vx, vy),
			"wavy dash must not have sharp interior cusps",
		);
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
			const geometry = glyphStore.queryByUnicode(code).geometry;
			const contours = geometry.toContours();
			if (code === 0x3030) assertSmoothWave(geometry);
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
		assert.equal(contours(0x3030).length, 1, "wavy dash must have one outline");
		assert.equal(contours(0x3036).length, 4, "postal mark must not touch the circle");
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
			for (const code of resizedCjkCodes) {
				const glyph = glyphStore.queryByUnicode(code);
				const scale = [0x3001, 0x3002, 0x301d, 0x301e, 0x301f].includes(code)
					? para.advanceScaleI
					: code === 0x3003 ? para.advanceScaleF : 1;
				assert.ok(
					Math.abs(glyph.advanceWidth - 500 * scale) < 0.001,
					`U+${code.toString(16)} has the wrong advance`,
				);
				assert.ok(
					contours(code).flat().every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
					`U+${code.toString(16)} exceeds its advance`,
				);
				if ([0x3012, 0x3013, 0x3036, 0x2b97].includes(code)) {
					const points = contours(code).flat();
					const center =
						(Math.min(...points.map((p) => p.x)) +
							Math.max(...points.map((p) => p.x))) /
						2;
					assert.ok(
						Math.abs(center - glyph.advanceWidth / 2) < 1,
						`U+${code.toString(16)} must be centered in its cell`,
					);
				}
				if (enlargedCjkHeights.some(([c]) => c === code)) {
					assertCjkVerticalFit(glyph, para, code);
					assertNoSelfIntersections(glyph.geometry, `U+${code.toString(16)}`);
				}
			}
			assert.equal(contours(0x3030).length, 1, "wavy dash must have one outline");
			assert.equal(contours(0x3036).length, 4, "postal mark must not touch the circle");
			if (weight === 420) {
				for (const [code, previousHeight] of enlargedCjkHeights) {
					assert.ok(
						geometryExtent(glyphStore.queryByUnicode(code), "y") > previousHeight * 1.1,
						`U+${code.toString(16)} must be larger than its previous size`,
					);
				}
			}
			if (spacing === "term" && weight === 420) {
				for (const [code, axis, previous] of [
					[0x3001, "y", 78], [0x3002, "x", 90], [0x3003, "y", 188],
					[0x3012, "y", 328], [0x3013, "y", 368], [0x301c, "y", 124],
					[0x301d, "x", 107], [0x301e, "x", 107], [0x301f, "x", 107],
					[0x3030, "x", 394], [0x3036, "x", 312], [0x303b, "y", 500],
					[0x303c, "y", 260], [0x303d, "y", 319],
				]) {
					const values = contours(code).flat().map((p) => p[axis]);
					assert.ok(
						Math.max(...values) - Math.min(...values) > previous * 1.1,
						`U+${code.toString(16)} must be visibly larger`,
					);
				}
				for (const [code, axis, minimum] of [
					[0x3012, "x", 380], [0x3013, "x", 420],
					[0x3036, "x", 460], [0x2b97, "x", 430],
				]) {
					const values = contours(code).flat().map((p) => p[axis]);
					assert.ok(
						Math.max(...values) - Math.min(...values) > minimum,
						`U+${code.toString(16)} must fill more of its cell`,
					);
				}
				for (const code of [0x237b, 0x237c, 0x238c, 0x239a]) {
					const glyph = glyphStore.queryByUnicode(code);
					const points = contours(code).flat();
					assert.ok(
						points.every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
						`U+${code.toString(16)} exceeds its advance`,
					);
					assertNoSelfIntersections(glyph.geometry, `U+${code.toString(16)}`);
				}
				for (const [code, minWidth, minHeight] of [
					[0x237b, 450, 545], [0x237c, 370, 500],
					[0x238c, 390, 280], [0x239a, 470, 445],
				]) {
					assert.ok(
						geometryExtent(glyphStore.queryByUnicode(code), "x") > minWidth &&
							geometryExtent(glyphStore.queryByUnicode(code), "y") > minHeight,
						`U+${code.toString(16)} must be enlarged`,
					);
				}
				for (const code of [0x2a79, 0x2a7a]) {
					const parts = contours(code);
					assert.equal(parts.length, 3, `U+${code.toString(16)} must retain its ring counter`);
					const boxes = parts.map((points) => {
						const xs = points.map((p) => p.x);
						const ys = points.map((p) => p.y);
						return {
							width: Math.max(...xs) - Math.min(...xs),
							height: Math.max(...ys) - Math.min(...ys),
							center: [
								(Math.min(...xs) + Math.max(...xs)) / 2,
								(Math.min(...ys) + Math.max(...ys)) / 2,
							],
						};
					});
					const ringParts = boxes
						.filter((box) => box.width < 150 && box.height < 150)
						.sort((a, b) => b.width - a.width)[0];
					const counter = boxes
						.filter((box) => box.width < 150 && box.height < 150)
						.sort((a, b) => a.width - b.width)[0];
					assert.ok(
						ringParts && ringParts.width > 95 && ringParts.height > 95,
						"inequality ring is too small",
					);
					assert.ok(
						Math.abs(ringParts.center[0] - counter.center[0]) < 0.01 &&
							Math.abs(ringParts.center[1] - counter.center[1]) < 0.01,
						"inequality ring counter is misaligned",
					);
				}
				const smashParts = contours(0x2a33);
				assert.equal(smashParts.length, 2, "smash product must retain its counter");
				const smashHole = smashParts
					.map((points) => {
						const xs = points.map((p) => p.x);
						const ys = points.map((p) => p.y);
						return {
							width: Math.max(...xs) - Math.min(...xs),
							height: Math.max(...ys) - Math.min(...ys),
						};
					})
					.sort((a, b) => a.width - b.width)[0];
				assert.ok(
					smashHole.width > 115 && smashHole.height > 115,
					"smash product strokes need more separation",
				);
			}
			if (spacing === "quasi-proportional" && weight === 420) {
				for (const [code, axis, previous] of [
					[0x3001, "y", 78], [0x3002, "x", 90],
					[0x301d, "x", 107], [0x301e, "x", 107], [0x301f, "x", 107],
				]) {
					const values = contours(code).flat().map((p) => p[axis]);
					assert.ok(
						Math.max(...values) - Math.min(...values) > previous * 1.1,
						`U+${code.toString(16)} must remain larger in a narrow cell`,
					);
				}
			}
			for (const [code, reference] of [
				[0x3001, 0x2c], [0x3002, 0x2e], [0x301d, 0x201c],
				[0x301e, 0x201d], [0x301f, 0x201e],
			]) {
				const extent = (glyphCode, axis) =>
					geometryExtent(glyphStore.queryByUnicode(glyphCode), axis);
				const height = extent(reference, "y");
				assert.ok(
					code === 0x3001 || code === 0x3002
						? extent(code, "y") >= height - 1
						: Math.abs(extent(code, "y") - height) < 1,
					`U+${code.toString(16)} has the wrong height relative to its Latin reference`,
				);
				if (spacing === "term" && code !== 0x3001 && code !== 0x3002) {
					assert.ok(
						Math.abs(extent(code, "x") - extent(reference, "x")) < 2,
						`U+${code.toString(16)} must match the Latin reference width`,
					);
				}
			}
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
			assert.equal(contours(0x303f).length, 5, "half fill space must have four triangular counters");
			const masu = contours(0x303c)[0];
			const halfFill = contours(0x303f)[0];
			for (const axis of ["x", "y"]) {
				for (const bound of [Math.min, Math.max]) {
					assert.ok(
						Math.abs(bound(...masu.map((p) => p[axis])) - bound(...halfFill.map((p) => p[axis]))) < 0.01,
						"masu and half fill space must share their frame",
					);
				}
			}
			const masuWidth = Math.max(...masu.map((p) => p.x)) - Math.min(...masu.map((p) => p.x));
			const masuHeight = Math.max(...masu.map((p) => p.y)) - Math.min(...masu.map((p) => p.y));
			assert.ok(masuHeight > masuWidth * 1.2, "masu frame must be rectangular");
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

for (const spacing of ["term", "quasi-proportional"]) {
	for (const weight of [120, 420, 920]) {
		for (const width of [416, 500]) test(`resized CJK glyphs fit italic ${spacing} ${weight} width ${width} cells`, () => {
			const argv = {
				shape: {
					serifs: "sans", spacing, weight, width,
					slope: "italic", slopeAngle: 9.4,
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
			for (const code of resizedCjkCodes) {
				const glyph = glyphStore.queryByUnicode(code);
				const contours = glyph.geometry.toContours();
				const scale = [0x3001, 0x3002, 0x301d, 0x301e, 0x301f].includes(code)
					? para.advanceScaleI
					: code === 0x3003 ? para.advanceScaleF : 1;
				assert.ok(Math.abs(glyph.advanceWidth - width * scale) < 0.001);
				assert.ok(
					contours.flat().every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
					`U+${code.toString(16)} exceeds its advance`,
				);
				assertNoSelfIntersections(glyph.geometry, `U+${code.toString(16)}`);
				if (enlargedCjkHeights.some(([c]) => c === code)) assertCjkVerticalFit(glyph, para, code);
				if (code === 0x3030) {
					assert.equal(contours.length, 1, "wavy dash must stay continuous");
					assertSmoothWave(glyph.geometry);
				}
				if (code === 0x3036) assert.equal(contours.length, 4, "postal mark must stay separate");
				if (code === 0x303f) assert.equal(contours.length, 5, "half fill space must retain four counters");
			}
			for (const [code, reference] of [
				[0x3001, 0x2c], [0x3002, 0x2e], [0x301d, 0x201c],
				[0x301e, 0x201d], [0x301f, 0x201e],
			]) {
				const height = (glyphCode) =>
					geometryExtent(glyphStore.queryByUnicode(glyphCode), "y");
				assert.ok(
					code === 0x3001 || code === 0x3002
						? height(code) >= height(reference) - 1
						: Math.abs(height(code) - height(reference)) < 1,
					`U+${code.toString(16)} height mismatch`,
				);
			}
		});
	}
}

for (const variant of ["square", "diamond", "hexagon"]) {
	test(`CJK punctuation fits ${variant} Latin punctuation variants`, () => {
		const argv = {
			shape: {
				serifs: "sans", spacing: "quasi-proportional", weight: 920, width: 416,
				slope: "italic", slopeAngle: 9.4,
			},
			featureControl: { noCvSs: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					"punctuation-dot": variant,
					"punctuation-comma": variant,
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		for (const [code, reference] of [[0x3001, 0x2c], [0x3002, 0x2e]]) {
			const glyph = glyphStore.queryByUnicode(code);
			const ref = glyphStore.queryByUnicode(reference);
			if (code !== 0x3002) {
				assert.ok(
					geometryExtent(glyph, "y") >= geometryExtent(ref, "y") - 1,
					`U+${code.toString(16)} height mismatch`,
				);
			}
			assert.ok(
				glyph.geometry.toContours().flat().every((p) => p.x >= 0 && p.x <= glyph.advanceWidth),
				`U+${code.toString(16)} exceeds its advance`,
			);
		}
	});
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
