import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import { applyMetricOverride } from "@iosevka/param/metric-override";
import * as Variant from "@iosevka/param/variant";
import { nexsevkaMetricOverride } from "./nexsevka-currency-metrics.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variants = read("variants");

function build(
	weight,
	slope,
	diacritic,
	punctuation,
	dot = "round",
	otherDots = {},
) {
	const argv = {
		shape: {
			serifs: "sans",
			spacing: "term",
			weight,
			width: 586,
			slope,
			slopeAngle: slope === "italic" ? 10 : 0,
		},
		featureControl: { noCvSs: false },
		variants: {
			design: {
				"diacritic-dot": dot,
				"punctuation-dot": "square",
				"diacritic-comma": diacritic,
				"punctuation-comma": punctuation,
				"capital-latin-gamma": "serifless",
				"latin-gamma": "serifless",
				...otherDots,
			},
		},
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	applyMetricOverride(para, nexsevkaMetricOverride, argv);
	return buildGlyphs(para, {
		blockIsNeeded: () => true,
		glyphIsNeeded: () => true,
	}).glyphStore;
}

await Geom.Init();
function bounds(glyph) {
	const points = glyph.geometry
		.toBezArcs()
		.flatMap((contour) =>
			contour.flatMap((arc) =>
				Array.from({ length: 25 }, (_, i) => arc.eval(i / 24)),
			),
		);
	return {
		xMin: Math.min(...points.map((p) => p.x)),
		xMax: Math.max(...points.map((p) => p.x)),
		yMin: Math.min(...points.map((p) => p.y)),
		yMax: Math.max(...points.map((p) => p.y)),
	};
}

for (const [label, weight, slope] of [
	["Thin", 260, "upright"],
	["Regular", 537, "upright"],
	["Heavy", 920, "upright"],
	["Heavy Italic", 920, "italic"],
]) {
	test(`${label} comma selectors independently control all requested characters`, () => {
		const round = build(weight, slope, "round", "round");
		const square = build(weight, slope, "square", "round");
		const diamond = build(weight, slope, "diamond", "round");
		const prime = build(weight, slope, "prime", "prime");
		const tick = build(weight, slope, "tick", "tick");
		const mixed = build(weight, slope, "prime", "tick");
		const reverseMixed = build(weight, slope, "tick", "prime");
		const squareDot = build(weight, slope, "round", "round", "square");
		for (const name of ["commaBelow", "gComma", "comma", "semicolon"]) {
			const outlines = [round, prime, tick, mixed].map((store) => {
				const glyph = store.queryByNameEnsured(name);
				const contours = glyph.geometry.toContours();
				assert.ok(
					contours.length &&
						contours
							.flat()
							.every(
								(p) =>
									Number.isFinite(p.x) &&
									Number.isFinite(p.y),
							),
				);
				return contours;
			});
			assert.notDeepEqual(
				outlines[0],
				outlines[1],
				`prime must alter ${name}`,
			);
			assert.notDeepEqual(
				outlines[1],
				outlines[2],
				`tick must differ from prime ${name}`,
			);
			assert.deepEqual(
				outlines[3],
				outlines[name === "commaBelow" || name === "gComma" ? 1 : 2],
				`independent selection ${name}`,
			);
		}
		for (const code of [
			0x313, 0x314, 0x326, 0x2e41, 0x2e32, 0x2e34, 0x204f, 0x2e35, 0x2e49,
			0x2e4e, 0x149,
		]) {
			const glyph = tick.queryByUnicode(code);
			assert.ok(
				glyph && glyph.geometry.toContours().length,
				`missing tick U+${code.toString(16)}`,
			);
		}
		const primeComma = bounds(prime.queryByNameEnsured("comma"));
		const tickComma = bounds(tick.queryByNameEnsured("comma"));
		assert.deepEqual(
			prime.queryByNameEnsured("comma").geometry.toContours(),
			reverseMixed.queryByNameEnsured("comma").geometry.toContours(),
			"diacritic selector must not affect punctuation prime",
		);
		const primeHeight = primeComma.yMax - primeComma.yMin;
		assert.ok(
			Math.abs(tickComma.yMax - tickComma.yMin - primeHeight) <
				primeHeight * 0.02,
			"tick comma height matches prime",
		);
		assert.ok(
			Math.abs(tickComma.yMax - primeComma.yMax) < primeHeight * 0.02,
			"tick and prime comma tops align",
		);
		for (const name of ["commaAbove", "commaBelow", "revCommaAbove"]) {
			const primeMark = bounds(prime.queryByNameEnsured(name));
			const tickMark = bounds(tick.queryByNameEnsured(name));
			const markHeight = tickMark.yMax - tickMark.yMin;
			assert.ok(
				Math.abs(primeMark.yMax - primeMark.yMin - markHeight) <
					markHeight * 0.02,
				`${name}: prime height matches tick`,
			);
			assert.ok(
				Math.abs(primeMark.yMax - tickMark.yMax) < markHeight * 0.02,
				`${name}: prime and tick align`,
			);
		}
		for (const [variant, store] of Object.entries({
			round,
			square,
			diamond,
			prime,
			tick,
		})) {
			const above = store.queryByNameEnsured("commaAbove");
			const aboveBounds = bounds(above);
			assert.ok(
				above.baseAnchors.above.y - above.markAnchors.above.y >
					aboveBounds.yMax - aboveBounds.yMin,
				`${variant} stacked marks have clearance`,
			);
			for (const name of ["turnCommaAbove", "revCommaAbove", "commaTR"]) {
				const glyph = store.queryByNameEnsured(name);
				const b = bounds(glyph);
				assert.ok(
					Math.abs(b.yMin - aboveBounds.yMin) < 0.1,
					`${variant} ${name} bottom aligns`,
				);
				assert.ok(
					Math.abs(b.yMax - aboveBounds.yMax) < 0.1,
					`${variant} ${name} top aligns`,
				);
				if (name !== "commaTR") {
					assert.deepEqual(
						glyph.markAnchors.above,
						above.markAnchors.above,
						`${variant} ${name} mark anchor`,
					);
					for (const axis of ["x", "y"]) {
						assert.ok(
							Math.abs(
								glyph.baseAnchors.above[axis] -
									above.baseAnchors.above[axis],
							) < 1e-6,
							`${variant} ${name} stacking anchor`,
						);
					}
				}
				const double = bounds(
					store.queryByNameEnsured("dblCommaAbove"),
				);
				assert.ok(
					Math.abs(double.yMin - aboveBounds.yMin) < 0.1 &&
						Math.abs(double.yMax - aboveBounds.yMax) < 0.1,
					`${variant} paired commas align`,
				);
			}
			const below = bounds(store.queryByNameEnsured("commaBelow"));
			assert.ok(
				Math.abs(
					below.yMax -
						below.yMin -
						(aboveBounds.yMax - aboveBounds.yMin),
				) < 0.1,
				`${variant} below height`,
			);
			for (const code of [
				0x312, 0x313, 0x314, 0x315, 0x31b, 0x326, 0x343, 0x485,
			]) {
				assert.ok(
					store.queryByUnicode(code)?.geometry.toContours().length,
					`${variant} U+${code.toString(16)}`,
				);
			}
			if (variant === "prime" || variant === "tick") {
				const ogonek = bounds(store.queryByNameEnsured("ogonekAbove"));
				assert.ok(
					Math.abs(
						aboveBounds.yMax -
							aboveBounds.yMin -
							(ogonek.yMax - ogonek.yMin),
					) < 0.1,
					`${variant} height matches ogonek`,
				);
				assert.ok(
					aboveBounds.xMax - aboveBounds.xMin >=
						0.8 * (ogonek.xMax - ogonek.xMin),
					`${variant} width is comparable to ogonek`,
				);
			}
		}
		for (const name of ["horn", "longHorn", "oHorn", "OHorn"]) {
			const outline = (store) =>
				store.queryByNameEnsured(name).geometry.toContours();
			assert.notDeepEqual(
				outline(prime),
				outline(tick),
				`${name} tick has a diagonal top cut`,
			);
			if (name === "horn" || name === "longHorn") {
				assert.deepEqual(
					outline(squareDot),
					squareDot
						.queryByNameEnsured(`${name}.round`)
						.geometry.toContours(),
					`${name} follows round comma despite square diacritic dot`,
				);
			}
			assert.notDeepEqual(
				outline(round),
				outline(square),
				`${name} follows square comma`,
			);
			assert.notDeepEqual(
				outline(square),
				outline(diamond),
				`${name} follows diamond comma`,
			);
			assert.notDeepEqual(
				outline(round),
				outline(prime),
				`${name} follows arc comma`,
			);
		}
		const stacked = bounds(tick.queryByUnicode(0x2e49));
		assert.ok(
			stacked.yMax - stacked.yMin >=
				2 * (tickComma.yMax - tickComma.yMin),
			"stacked tick commas do not overlap",
		);
		assert.deepEqual(
			round.queryByUnicode(0x2e).geometry.toContours(),
			tick.queryByUnicode(0x2e).geometry.toContours(),
		);
	});

	test(`${label} angular commas and hexagonal dots propagate to their dependents`, () => {
		const stores = {};
		for (const variant of ["hexagon", "corner", "bottom-cut"]) {
			const suffix = variant === "bottom-cut" ? "bottomCut" : variant;
			const store = build(weight, slope, variant, variant, "hexagon", {
				tittle: "hexagon",
				"punctuation-dot": "hexagon",
				"braille-dot": "hexagon",
			});
			stores[variant] = store;
			for (const code of [
				0x2e, 0x2c, 0x3a, 0x3b, 0x21, 0x3f, 0x69, 0x28ff, 0x31b, 0x1a0,
				0x1a1, 0x2e49,
			]) {
				const glyph = store.queryByUnicode(code);
				assert.ok(
					glyph?.geometry.toContours().length,
					`${variant} U+${code.toString(16)}`,
				);
				assert.ok(
					glyph.geometry
						.toContours()
						.flat()
						.every(
							(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
						),
					`${variant} finite U+${code.toString(16)}`,
				);
			}
			assert.ok(
				store
					.queryByNameEnsured("dieresisAbove.hexagon")
					.geometry.toContours().length,
			);
			for (const name of [
				"comma",
				"revComma",
				"turnComma",
				"raisedComma",
				"doubleStackedComma",
				"commaAbove",
				"revCommaAbove",
				"horn",
				"longHorn",
			]) {
				assert.deepEqual(
					store.queryByNameEnsured(name).geometry.toContours(),
					store
						.queryByNameEnsured(`${name}.${suffix}`)
						.geometry.toContours(),
					`${name} follows ${variant}`,
				);
			}
			if (variant === "bottom-cut") {
				for (const name of ["horn", "longHorn"]) {
					assert.deepEqual(
						store.queryByNameEnsured(name).geometry.toContours(),
						store
							.queryByNameEnsured(`${name}.tick`)
							.geometry.toContours(),
						`${name} bottom-cut shares the tick horn`,
					);
					assert.ok(
						bounds(store.queryByNameEnsured(name)).yMax >
							bounds(store.queryByNameEnsured(`${name}.prime`))
								.yMax,
						`${name} has a taller top-cut vertical`,
					);
					if (slope === "upright") {
						const glyph = store.queryByNameEnsured(name);
						const b = bounds(glyph);
						const vertical = glyph.geometry
							.toContours()
							.some((contour) =>
								contour.some((point, index) => {
									const next =
										contour[(index + 1) % contour.length];
									return (
										Math.abs(point.x - next.x) < 1e-6 &&
										Math.abs(point.y - next.y) >
											0.1 * (b.yMax - b.yMin)
									);
								}),
							);
						assert.ok(
							vertical,
							`${name} has a visible vertical segment`,
						);
					}
				}
			}
			if (variant === "corner") {
				for (const name of ["horn", "longHorn"]) {
					assert.equal(
						store.queryByNameEnsured(name).geometry.toContours()
							.length,
						1,
						`${name} corner is one continuous polyline`,
					);
				}
			}
			if (variant === "corner" || variant === "bottom-cut") {
				const actual = bounds(store.queryByNameEnsured("commaAbove"));
				const tick = bounds(
					store.queryByNameEnsured("commaAbove.tick"),
				);
				const widthRatio =
					(actual.xMax - actual.xMin) / (tick.xMax - tick.xMin);
				const heightRatio =
					(actual.yMax - actual.yMin) / (tick.yMax - tick.yMin);
				assert.ok(
					widthRatio >= 1.05 && widthRatio <= 1.8,
					`${variant} mark is wider than tick`,
				);
				assert.ok(
					heightRatio >= 1.23 && heightRatio <= 1.27,
					`${variant} mark is taller than tick`,
				);
				if (slope === "upright") {
					for (const name of ["comma", "commaAbove"]) {
						const points = store
							.queryByNameEnsured(name)
							.geometry.toContours()[0];
						const headThickness = points[0].y - points[4].y;
						const tailThickness =
							variant === "corner"
								? Math.abs(points[2].x - points[3].x)
								: Math.abs(points[1].x - points[3].x);
						assert.ok(
							headThickness > 1.2 * tailThickness,
							`${name} ${variant} head is thicker than the tail`,
						);
					}
				}
			}
			if (variant === "hexagon") {
				for (const name of ["comma", "commaAbove"]) {
					const height = (suffix) => {
						const b = bounds(
							store.queryByNameEnsured(`${name}.${suffix}`),
						);
						return b.yMax - b.yMin;
					};
					const hexHeight = height("hexagon");
					for (const other of ["round", "square", "diamond"]) {
						assert.ok(
							hexHeight >= 0.8 * height(other),
							`${name} hexagon height is comparable to ${other}`,
						);
						assert.ok(
							hexHeight <= height(other),
							`${name} hexagon tail is shorter than ${other}`,
						);
					}
				}
			}
			for (const name of [
				"semicolon",
				"revSemicolon",
				"punctusElevatus",
			]) {
				assert.deepEqual(
					store.queryByNameEnsured(name).geometry.toContours(),
					store
						.queryByNameEnsured(`${name}.hexagon.${suffix}`)
						.geometry.toContours(),
					`${name} follows both selectors`,
				);
			}
			const stacked = bounds(
				store.queryByNameEnsured("doubleStackedComma"),
			);
			const comma = bounds(store.queryByNameEnsured("comma"));
			assert.ok(
				stacked.yMax - stacked.yMin >= 2 * (comma.yMax - comma.yMin),
				`${variant} stacked commas do not overlap`,
			);
		}
		const mixed = build(weight, slope, "corner", "bottom-cut", "round");
		for (const [name, variant] of [
			["commaAbove", "corner"],
			["horn", "corner"],
			["longHorn", "corner"],
			["comma", "bottom-cut"],
			["revComma", "bottom-cut"],
		]) {
			assert.deepEqual(
				mixed.queryByNameEnsured(name).geometry.toContours(),
				stores[variant].queryByNameEnsured(name).geometry.toContours(),
				`${name} follows its own comma selector`,
			);
		}
		for (const name of ["period", "i", "dieresisAbove"]) {
			assert.notDeepEqual(
				mixed.queryByNameEnsured(name).geometry.toContours(),
				stores.hexagon.queryByNameEnsured(name).geometry.toContours(),
				`${name} follows its dot selector`,
			);
		}
		assert.notDeepEqual(
			mixed.queryByUnicode(0x28ff).geometry.toContours(),
			stores.hexagon.queryByUnicode(0x28ff).geometry.toContours(),
			"braille follows its dot selector",
		);
		if (slope === "italic") {
			const upright = build(
				weight,
				"upright",
				"corner",
				"bottom-cut",
				"round",
			);
			for (const [name, variant] of [
				["comma.corner", "corner"],
				["comma.bottomCut", "bottom-cut"],
			]) {
				const italicPoints = stores[variant]
					.queryByNameEnsured(name)
					.geometry.toContours()
					.flat();
				const uprightPoints = upright
					.queryByNameEnsured(name)
					.geometry.toContours()
					.flat();
				assert.equal(
					italicPoints.length,
					uprightPoints.length,
					`${name} point count`,
				);
				const shifts = italicPoints.map(
					(point, index) => point.x - uprightPoints[index].x,
				);
				const b = bounds(upright.queryByNameEnsured(name));
				assert.ok(
					Math.max(...shifts) - Math.min(...shifts) >
						0.1 * (b.yMax - b.yMin),
					`${name} follows the italic slope`,
				);
			}
		}
	});
}
