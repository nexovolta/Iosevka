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
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variantData = read("variants");
const choices = [...Variant.parse(variantData).primes.get("a").variants.values()]
	.filter(v => /curved-bar-(rising|falling)$/.test(v.key));
await Geom.Init();

function build(weight, slope, noCvSs) {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
		featureControl: { noCvSs },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
	};
	const para = init(data, argv);
	Variant.apply(variantData, para, argv);
	return { para, glyphStore: buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true }).glyphStore };
}

function upperBarAt(contours, x) {
	const crossings = [];
	for (const contour of contours) {
		let from = contour[0];
		function sample(to) {
			if ((from.x <= x && x < to.x) || (to.x <= x && x < from.x)) {
				const y = from.y + (to.y - from.y) * (x - from.x) / (to.x - from.x);
				if (y > 150 && y < 350) crossings.push(y);
			}
			from = to;
		}
		for (let i = 1; i <= contour.length; i++) {
			const p = contour[i % contour.length];
			const q = contour[(i + 1) % contour.length];
			if (p.type === 0) {
				sample(p);
			} else if (p.type === 3) {
				const end = q.type === 0 ? q : { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
				const start = from;
				for (let j = 1; j <= 16; j++) {
					const t = j / 16;
					sample({ x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * p.x + t ** 2 * end.x,
						y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * p.y + t ** 2 * end.y });
				}
				if (q.type === 0) i++;
			} else {
				throw new Error(`Unexpected point type ${p.type}`);
			}
		}
	}
	assert.ok(crossings.length, `No bar at x=${x}`);
	return Math.max(...crossings);
}

test("curved a selections reach their case, half, swash, hook and iotated derivatives", () => {
	assert.equal(choices.length, 64);
	const { para, glyphStore } = build(420, "upright", false);
	const prime = para.variants.primes.get("a");
	for (const choice of choices) {
		const cv = prime.variants.get(choice.key);
		for (const [name, selector, target] of [
			["a", "a", "a"],
			["cyrl/a", "a", "a"],
			["aSwash", "a", "aSwash"],
			["cyrl/aIotated", "a", "cyrl/aIotated"],
			["aHalf", "aHalf", "aHalf"],
			["aRetroflexHook", "aRetroflexHook", "aRetroflexHook"],
		]) {
			const expected = `${target}.${choice.selector[selector]}`;
			assert.equal(cv.get(glyphStore.queryByNameEnsured(name)), expected, `${choice.key}: ${name}`);
			assert.ok(glyphStore.queryByName(expected), expected);
		}
	}
});

for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`curved a and derivative outlines are valid at ${weight} ${slope}`, () => {
		const { glyphStore } = build(weight, slope, true);
		const names = new Set();
		for (const v of choices) {
			names.add(`a.${v.selector.a}`);
			names.add(`aSwash.${v.selector.a}`);
			names.add(`cyrl/aIotated.${v.selector.a}`);
			names.add(`aHalf.${v.selector.aHalf}`);
			names.add(`aRetroflexHook.${v.selector.aRetroflexHook}`);
		}
		for (const direction of ["Rising", "Falling"]) {
			for (const body of ["Serifless", "ToothlessRounded"]) {
				const suffix = `doubleStorey${body}CurvedBar${direction}`;
				for (const name of ["reva", "ae/a", "aa"]) names.add(`${name}.${suffix}`);
				if (body === "ToothlessRounded") {
					for (const name of ["ao/a", "au/a", "av/a", "ay/a"]) names.add(`${name}.${suffix}`);
				}
			}
		}
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			assert.ok(contours.length && contours.every(c => c.length >= 3 && c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))), name);
			if (name.startsWith("a.")) {
				assert.ok(contours.length >= 2, `Missing bowl counter: ${name}`);
				assert.ok(contours.every(c => c.every(p =>
					p.x >= -glyph.advanceWidth / 2 && p.x <= 1.5 * glyph.advanceWidth &&
					p.y >= -250 && p.y <= 800
				)), `Out-of-bounds contour: ${name}`);
			}
		}
		const rising = glyphStore.queryByNameEnsured("a.doubleStoreySeriflessCurvedBarRising");
		const falling = glyphStore.queryByNameEnsured("a.doubleStoreySeriflessCurvedBarFalling");
		assert.notDeepEqual(rising.geometry.toContours(), falling.geometry.toContours());
		if (weight === 120 && slope === "upright") {
			const contours = new Geom.SimplifyGeometry(rising.geometry, rising.gizmo, true).toContours();
			const [left, middle, right] = [0.48, 0.60, 0.72].map(x => upperBarAt(contours, x * rising.advanceWidth));
			assert.ok(right - left > 5 && right - left < 50, "Rising bar should rise gently toward the stem");
			assert.ok((left + right) / 2 - middle > 1, "Rising bar should curve instead of forming a diagonal");
		}
	});
}
