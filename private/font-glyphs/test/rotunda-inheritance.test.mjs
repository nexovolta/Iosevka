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
		const build = (slope, slopeAngle) => {
			const argv = {
				shape: {
					serifs: "sans",
					spacing: "term",
					weight,
					width: 500,
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
	}
});
