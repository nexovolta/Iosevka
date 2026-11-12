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
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variants = read("variants");
const hooks = [
	"serifless",
	"unilateralSerifed",
	"unilateralInwardSerifed",
	"topFlatHook",
	"topCornerHook",
];
await Geom.Init();

function bezierContourArea(arcs) {
	const quadrature = [
		[0.5 - Math.sqrt(15) / 10, 5 / 18],
		[0.5, 4 / 9],
		[0.5 + Math.sqrt(15) / 10, 5 / 18],
	];
	let twiceArea = 0;
	for (const { a, b, c, d } of arcs) {
		for (const [t, weight] of quadrature) {
			const u = 1 - t;
			const x = u ** 3 * a.x + 3 * u ** 2 * t * b.x + 3 * u * t ** 2 * c.x + t ** 3 * d.x;
			const y = u ** 3 * a.y + 3 * u ** 2 * t * b.y + 3 * u * t ** 2 * c.y + t ** 3 * d.y;
			const dx = 3 * (u ** 2 * (b.x - a.x) + 2 * u * t * (c.x - b.x) + t ** 2 * (d.x - c.x));
			const dy = 3 * (u ** 2 * (b.y - a.y) + 2 * u * t * (c.y - b.y) + t ** 2 * (d.y - c.y));
			twiceArea += weight * (x * dy - y * dx);
		}
	}
	return Math.abs(twiceArea / 2);
}

function inkBounds(glyph) {
	const points = glyph.geometry.toBezArcs().flatMap((contour) =>
		contour.flatMap((arc) =>
			Array.from({ length: 129 }, (_, i) =>
				glyph.gizmo.unapply(arc.eval(i / 128)),
			),
		),
	);
	assert.ok(points.length, "glyph must have an outline");
	return {
		xMin: Math.min(...points.map((p) => p.x)),
		xMax: Math.max(...points.map((p) => p.x)),
		yMax: Math.max(...points.map((p) => p.y)),
	};
}

function upperDiagonalJoinAngles(glyph, cap) {
	const result = [];
	for (const contour of glyph.geometry.toBezArcs()) {
		const arcs = contour.map((arc) =>
			[arc.a, arc.b, arc.c, arc.d].map((p) => glyph.gizmo.unapply(p)),
		);
		for (let i = 0; i < arcs.length; i++) {
			const [a, b, c, d] = arcs[i];
			const dx = d.x - a.x;
			const dy = d.y - a.y;
			const length = Math.hypot(dx, dy);
			const distanceFromLine = (p) =>
				Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length;
			const top = a.y > d.y ? a : d;
			if (
				Math.abs(dy) < 0.08 * cap || dx * dy >= 0 ||
				top.y < 0.48 * cap || top.y > 0.8 * cap ||
				distanceFromLine(b) > 0.01 || distanceFromLine(c) > 0.01
			) continue;

			const topIsStart = top === a;
			const step = topIsStart ? -1 : 1;
			let next;
			for (let n = 1; n < arcs.length; n++) {
				next = arcs[(i + step * n + arcs.length) % arcs.length];
				if (Math.hypot(next[3].x - next[0].x, next[3].y - next[0].y) > 0.01)
					break;
			}
			const away = topIsStart ? next[0] : next[3];
			if (away.y <= top.y + 0.01) continue;
			const tangent = topIsStart
				? { x: next[3].x - next[2].x, y: next[3].y - next[2].y }
				: { x: next[1].x - next[0].x, y: next[1].y - next[0].y };
			assert.ok(Math.hypot(tangent.x, tangent.y) > 1e-8, "degenerate join tangent");
			result.push(Math.atan2(
				Math.abs(dx * tangent.y - dy * tangent.x),
				Math.abs(dx * tangent.x + dy * tangent.y),
			) * 180 / Math.PI);
		}
	}
	return result;
}

test("rotunda variants retain independent leg and case-specific hook relations", () => {
	const argv = {
		shape: {
			serifs: "sans",
			spacing: "term",
			weight: 420,
			width: 500,
			slope: "upright",
			slopeAngle: 0,
		},
		featureControl: { noCvSs: false },
		variants: {
			design: {
				"capital-latin-gamma": "serifless",
				"latin-gamma": "serifless",
				"capital-r": "straight-serifless",
				"cyrl-capital-ze": "unilateral-serifed",
				"cyrl-ze": "unilateral-inward-serifed",
			},
		},
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: () => true,
		glyphIsNeeded: () => true,
	});
	const rPrime = para.variants.primes.get("capital-r");
	const upperZe = para.variants.primes.get("cyrl-capital-ze");
	const lowerZe = para.variants.primes.get("cyrl-ze");
	const legs = [
		...new Set(
			[...rPrime.variants.values()]
				.map((v) => v.selector.RRotunda)
				.filter(Boolean),
		),
	];
	for (const [name, zePrime, zeSelector, initialHook, otherPrime] of [
		["RRotunda", upperZe, "cyrl/Ze/topSerif", "unilateralSerifed", lowerZe],
		[
			"rRotunda",
			lowerZe,
			"cyrl/ze/topSerif",
			"unilateralInwardSerifed",
			upperZe,
		],
	]) {
		const root = glyphStore.queryByNameEnsured(name);
		for (const hook of hooks) {
			const cv = [...zePrime.variants.values()].find(
				(v) => v.selector[zeSelector] === hook,
			);
			assert.ok(cv, `${name} ${hook}`);
			assert.equal(cv.get(root), `${name}.straightSerifless.${hook}`);
			const glyph = glyphStore.queryByNameEnsured(cv.get(root));
			const contours = new Geom.SimplifyGeometry(
				glyph.geometry,
				glyph.gizmo,
				true,
			).toContours();
			assert.ok(
				contours.length &&
					contours.every((c) =>
						c.every(
							(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
						),
					),
			);
		}
		for (const leg of legs) {
			const cv = [...rPrime.variants.values()].find(
				(v) => v.selector.RRotunda === leg,
			);
			assert.equal(cv.get(root), `${name}.${leg}.${initialHook}`);
			const selectedLeg = glyphStore.queryByNameEnsured(cv.get(root));
			for (const hook of hooks) {
				const hookCv = [...zePrime.variants.values()].find(
					(v) => v.selector[zeSelector] === hook,
				);
				assert.equal(hookCv.get(selectedLeg), `${name}.${leg}.${hook}`);
				const selectedHook = glyphStore.queryByNameEnsured(
					`${name}.straightSerifless.${hook}`,
				);
				assert.equal(cv.get(selectedHook), `${name}.${leg}.${hook}`);
			}
		}
		for (const cv of otherPrime.variants.values())
			assert.equal(cv.get(root), undefined);
	}
});

test("Cossic rotunda d and looped long s use the upright outline under italic skew", () => {
	for (const weight of [120, 420, 920]) {
		const build = (slope, slopeAngle, width = 500) => {
			const argv = {
				shape: {
					serifs: "sans",
					spacing: "term",
					weight,
					width,
					slope,
					slopeAngle,
				},
				featureControl: { noCvSs: false },
				variants: {
					design: {
						"capital-latin-gamma": "serifless",
						"latin-gamma": "serifless",
					},
				},
			};
			const para = init(data, argv);
			Variant.apply(variants, para, argv);
			return buildGlyphs(para, {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			}).glyphStore;
		};
		const upright = build("upright", 0);
		const italic = build("italic", 9.4);
		const zeroSlopeItalic = weight === 420 ? build("italic", 0) : null;
		const serifs = [
			"Serifless",
			"MiddleSerifed",
			"MiddleSerifedXH",
			"MiddleSerifedHalfAscender",
			"BottomSerifed",
			"DoubleSerifed",
			"DoubleSerifedXH",
			"DoubleSerifedHalfAscender",
		];
		const names = [
			...["curlyBar", "straightBar", "closedContour"].map(
				(suffix) => `dRotundaCrossingLoop.${suffix}`,
			),
			...["bentHook", "flatHook", "cornerHook"].flatMap((top) =>
				[
					...serifs,
					...["Descending", "Tailed", "DiagonalTailed"].flatMap((bottom) =>
						serifs.slice(0, 4).map((serif) => `${bottom}${serif}`),
					),
				].map((suffix) => `longsTopLoop.${top}${suffix}`),
			),
		];
		for (const name of names) {
			const u = upright.queryByNameEnsured(name);
			const i = italic.queryByNameEnsured(name);
			const expected = Geom.TransformedGeometry.create(i.gizmo, u.geometry);
			const contours = (geometry) =>
				new Geom.SimplifyGeometry(geometry, i.gizmo, true).toContours();
			const actual = contours(i.geometry);
			assert.deepEqual(
				actual,
				contours(expected),
				`${name}, weight ${weight}`,
			);
			assert.equal(i.advanceWidth, u.advanceWidth, `${name}, weight ${weight}`);
			if (name.startsWith("dRotundaCrossingLoop."))
				assert.ok(
					actual.flat().every((p) => p.y >= data.iosevka.descender - 0.01),
				);
			if (zeroSlopeItalic) {
				const z = zeroSlopeItalic.queryByNameEnsured(name);
				const zeroContours = (geometry) =>
					new Geom.SimplifyGeometry(geometry, z.gizmo, true).toContours();
				assert.deepEqual(
					zeroContours(z.geometry),
					zeroContours(u.geometry),
					`${name}, zero slope`,
				);
			}
		}
		const mask = new Geom.ContourSetGeometry([[
			{ type: 0, x: -10000, y: 0.6 * data.iosevka.xHeight },
			{ type: 0, x: -10000, y: 10000 },
			{ type: 0, x: 10000, y: 10000 },
			{ type: 0, x: 10000, y: 0.6 * data.iosevka.xHeight },
		]]);
		for (const top of ["bentHook", "flatHook", "cornerHook"]) {
			for (const serif of ["Serifless", "MiddleSerifedHalfAscender"]) {
				const head = upright.queryByNameEnsured(`longsTopLoop.${top}${serif}`);
				const bounds = inkBounds(head);
				assert.ok(
					Math.abs(bounds.xMin - (head.advanceWidth - bounds.xMax)) < 0.1,
					`${top} ${serif}, weight ${weight}: asymmetric head margins`,
				);
				for (const bottom of ["Descending", "Tailed", "DiagonalTailed"]) {
					const other = upright.queryByNameEnsured(`longsTopLoop.${top}${bottom}${serif}`);
					const clip = (glyph) => new Geom.BooleanGeometry(
						TypoGeom.Boolean.ClipType.Intersection,
						[glyph.geometry, mask],
					);
					const difference = new Geom.BooleanGeometry(
						TypoGeom.Boolean.ClipType.Xor,
						[clip(head), clip(other)],
					);
					// Boolean clipping can leave sub-thousandth-unit slivers along identical curves.
					for (const contour of difference.toBezArcs())
						assert.ok(bezierContourArea(contour) < 0.02, `${top} ${bottom} ${serif}, weight ${weight}`);
				}
			}
		}
		const rotunda = upright.queryByNameEnsured("dRotundaCrossingLoop.curlyBar");
		assert.ok(
			Math.abs(inkBounds(rotunda).yMax - data.iosevka.ascender) < 0.1,
			`rotunda outer arc must reach the ascender at weight ${weight}`,
		);
		const joinAngles = upperDiagonalJoinAngles(rotunda, data.iosevka.cap);
		assert.ok(joinAngles.length, `missing upper diagonal join at weight ${weight}`);
		assert.ok(
			joinAngles.every((angle) => angle < 0.05),
			`rotunda arc-to-diagonal tangent mismatch at weight ${weight}: ${joinAngles}`,
		);
		const rotundaContours = new Geom.SimplifyGeometry(
			rotunda.geometry,
			rotunda.gizmo,
			true,
		).toContours();
		const straightEdges = rotundaContours.flatMap((contour) =>
			contour.flatMap((p, index) => {
				const q = contour[(index + 1) % contour.length];
				const dx = q.x - p.x;
				const dy = q.y - p.y;
				return p.type === 0 && q.type === 0 && Math.abs(dy) > 0.1 * data.iosevka.cap &&
					dx * dy < 0 && Math.abs(dx / dy) > 0.25
					? [dx / dy]
					: [];
			}),
		);
		assert.ok(straightEdges.length >= 2, `missing straight crossing edges at weight ${weight}`);
		const upperCounter = rotundaContours.find((contour) => {
			const ys = contour.map((point) => point.y);
			return Math.max(...ys) > 0.75 * data.iosevka.cap &&
				Math.min(...ys) < 0.38 * data.iosevka.cap;
		});
		assert.ok(upperCounter, `missing large crossing arc at weight ${weight}`);
		if (weight === 920) {
			for (const width of [416, 720]) {
				const wideOrNarrow = build("upright", 0, width)
					.queryByNameEnsured("dRotundaCrossingLoop.curlyBar");
				const angles = upperDiagonalJoinAngles(wideOrNarrow, data.iosevka.cap);
				assert.ok(angles.length && angles.every((angle) => angle < 0.1),
					`rotunda tangent mismatch at width ${width}: ${angles}`);
			}
		}
	}
});
