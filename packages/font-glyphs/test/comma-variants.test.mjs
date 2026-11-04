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

function build(weight, slope, diacritic, punctuation) {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
		featureControl: { noCvSs: false },
		variants: { design: {
			"diacritic-dot": "round", "punctuation-dot": "square",
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
		const prime = build(weight, slope, "prime", "prime");
		const tick = build(weight, slope, "tick", "tick");
		const mixed = build(weight, slope, "prime", "tick");
		const reverseMixed = build(weight, slope, "tick", "prime");
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
		const stacked = bounds(tick.queryByUnicode(0x2e49));
		assert.ok(stacked.yMax - stacked.yMin >= 2 * (tickComma.yMax - tickComma.yMin), "stacked tick commas do not overlap");
		assert.deepEqual(round.queryByUnicode(0x2e).geometry.toContours(), tick.queryByUnicode(0x2e).geometry.toContours());
	});
}
