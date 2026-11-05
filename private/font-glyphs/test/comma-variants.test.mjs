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
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");

function build(weight, slope, diacritic, punctuation, dot = "round") {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
		featureControl: { noCvSs: false },
		variants: { design: {
			"diacritic-dot": dot, "punctuation-dot": "square",
			"diacritic-comma": diacritic, "punctuation-comma": punctuation,
			"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
		} },
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	applyMetricOverride(para, nexsevkaMetricOverride, argv);
	return buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true }).glyphStore;
}

await Geom.Init();
function bounds(glyph) {
	const points = glyph.geometry.toBezArcs().flatMap(contour =>
		contour.flatMap(arc => Array.from({ length: 25 }, (_, i) => arc.eval(i / 24)))
	);
	return {
		xMin: Math.min(...points.map(p => p.x)),
		xMax: Math.max(...points.map(p => p.x)),
		yMin: Math.min(...points.map(p => p.y)),
		yMax: Math.max(...points.map(p => p.y)),
	};
}

for (const [label, weight, slope] of [
	["Thin", 260, "upright"], ["Regular", 537, "upright"],
	["Heavy", 920, "upright"], ["Heavy Italic", 920, "italic"],
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
			const outlines = [round, prime, tick, mixed].map(store => {
				const glyph = store.queryByNameEnsured(name);
				const contours = glyph.geometry.toContours();
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
				return contours;
			});
			assert.notDeepEqual(outlines[0], outlines[1], `prime must alter ${name}`);
			assert.notDeepEqual(outlines[1], outlines[2], `tick must differ from prime ${name}`);
			assert.deepEqual(outlines[3], outlines[name === "commaBelow" || name === "gComma" ? 1 : 2], `independent selection ${name}`);
		}
		for (const code of [0x313, 0x314, 0x326, 0x2e41, 0x2e32, 0x2e34, 0x204f, 0x2e35, 0x2e49, 0x2e4e, 0x149]) {
			const glyph = tick.queryByUnicode(code);
			assert.ok(glyph && glyph.geometry.toContours().length, `missing tick U+${code.toString(16)}`);
		}
		const primeComma = bounds(prime.queryByNameEnsured("comma"));
		const tickComma = bounds(tick.queryByNameEnsured("comma"));
		assert.deepEqual(prime.queryByNameEnsured("comma").geometry.toContours(), reverseMixed.queryByNameEnsured("comma").geometry.toContours(), "diacritic selector must not affect punctuation prime");
		const primeHeight = primeComma.yMax - primeComma.yMin;
		assert.ok(Math.abs(tickComma.yMax - tickComma.yMin - primeHeight) < primeHeight * 0.02, "tick comma height matches prime");
		assert.ok(Math.abs(tickComma.yMax - primeComma.yMax) < primeHeight * 0.02, "tick and prime comma tops align");
		for (const name of ["commaAbove", "commaBelow", "revCommaAbove"]) {
			const primeMark = bounds(prime.queryByNameEnsured(name));
			const tickMark = bounds(tick.queryByNameEnsured(name));
			const markHeight = tickMark.yMax - tickMark.yMin;
			assert.ok(Math.abs(primeMark.yMax - primeMark.yMin - markHeight) < markHeight * 0.02, `${name}: prime height matches tick`);
			assert.ok(Math.abs(primeMark.yMax - tickMark.yMax) < markHeight * 0.02, `${name}: prime and tick align`);
		}
		for (const [variant, store] of Object.entries({ round, square, diamond, prime, tick })) {
			const above = store.queryByNameEnsured("commaAbove");
			const aboveBounds = bounds(above);
			assert.ok(above.baseAnchors.above.y - above.markAnchors.above.y > aboveBounds.yMax - aboveBounds.yMin, `${variant} stacked marks have clearance`);
			for (const name of ["turnCommaAbove", "revCommaAbove", "commaTR"]) {
				const glyph = store.queryByNameEnsured(name);
				const b = bounds(glyph);
				assert.ok(Math.abs(b.yMin - aboveBounds.yMin) < 0.1, `${variant} ${name} bottom aligns`);
				assert.ok(Math.abs(b.yMax - aboveBounds.yMax) < 0.1, `${variant} ${name} top aligns`);
				if (name !== "commaTR") {
					assert.deepEqual(glyph.markAnchors.above, above.markAnchors.above, `${variant} ${name} mark anchor`);
					for (const axis of ["x", "y"]) {
						assert.ok(Math.abs(glyph.baseAnchors.above[axis] - above.baseAnchors.above[axis]) < 1e-6, `${variant} ${name} stacking anchor`);
					}
				}
				const double = bounds(store.queryByNameEnsured("dblCommaAbove"));
				assert.ok(Math.abs(double.yMin - aboveBounds.yMin) < 0.1 && Math.abs(double.yMax - aboveBounds.yMax) < 0.1, `${variant} paired commas align`);
			}
			const below = bounds(store.queryByNameEnsured("commaBelow"));
			assert.ok(Math.abs((below.yMax - below.yMin) - (aboveBounds.yMax - aboveBounds.yMin)) < 0.1, `${variant} below height`);
			for (const code of [0x312, 0x313, 0x314, 0x315, 0x31b, 0x326, 0x343, 0x485]) {
				assert.ok(store.queryByUnicode(code)?.geometry.toContours().length, `${variant} U+${code.toString(16)}`);
			}
			if (variant === "prime" || variant === "tick") {
				const ogonek = bounds(store.queryByNameEnsured("ogonekAbove"));
				assert.ok(Math.abs((aboveBounds.yMax - aboveBounds.yMin) - (ogonek.yMax - ogonek.yMin)) < 0.1, `${variant} height matches ogonek`);
				assert.ok(aboveBounds.xMax - aboveBounds.xMin >= 0.8 * (ogonek.xMax - ogonek.xMin), `${variant} width is comparable to ogonek`);
			}
		}
		for (const name of ["horn", "longHorn", "oHorn", "OHorn"]) {
			const outline = store => store.queryByNameEnsured(name).geometry.toContours();
			assert.deepEqual(outline(prime), outline(tick), `${name} uses the same arc for prime and tick`);
			if (name === "horn" || name === "longHorn") {
				assert.deepEqual(outline(squareDot), squareDot.queryByNameEnsured(`${name}.round`).geometry.toContours(), `${name} follows round comma despite square diacritic dot`);
			}
			assert.notDeepEqual(outline(round), outline(square), `${name} follows square comma`);
			assert.notDeepEqual(outline(square), outline(diamond), `${name} follows diamond comma`);
			assert.notDeepEqual(outline(round), outline(prime), `${name} follows arc comma`);
		}
		const stacked = bounds(tick.queryByUnicode(0x2e49));
		assert.ok(stacked.yMax - stacked.yMin >= 2 * (tickComma.yMax - tickComma.yMin), "stacked tick commas do not overlap");
		assert.deepEqual(round.queryByUnicode(0x2e).geometry.toContours(), tick.queryByUnicode(0x2e).geometry.toContours());
	});
}
