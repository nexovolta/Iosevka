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
const variants = read("variants");
const tops = ["rounded", "flatHook", "cornerHook", "inwardSerifed", "serifedHook", "flatTop", "flatTopSerifed", "flatTopBroken", "flatTopBrokenSerifed"];
const tails = ["curly", "straightTail", "diagonalTail", "straightTailSharpCorner", "diagonalTailSharpCorner"];

await Geom.Init();

function build(weight, slope, enableCvSs) {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
		featureControl: { noCvSs: !enableCvSs },
		variants: { design: {
			"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
			three: "flat-top-broken-flat-hooked", "lower-xi": "flat-top-straight-tail-sharp-corner",
		} },
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	return { para, glyphStore: buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true }).glyphStore };
}

function outline(glyph) {
	return new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
}

function bottomX(contours) {
	const segments = [];
	for (const contour of contours) {
		for (const [i, p] of contour.entries()) {
			const q = contour[(i + 1) % contour.length];
			if (p.type === 0 && q.type === 0 && Math.hypot(q.x - p.x, q.y - p.y) > 20) {
				segments.push({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
			}
		}
	}
	assert.ok(segments.length, "tail terminal must have a straight edge");
	return segments.reduce((lowest, segment) => segment.y < lowest.y ? segment : lowest).x;
}

function hasDiagonal(contours, slope) {
	return contours.some(contour => contour.some((p, i) => {
		const q = contour[(i + 1) % contour.length];
		const dx = q.x - p.x;
		const dy = q.y - p.y;
		return p.type === 0 && q.type === 0 && Math.abs(dx) > 20 && Math.abs(dy / dx - slope) < 0.02;
	}));
}

test("three tops and xi tails independently select both ksi cases", () => {
	const { para, glyphStore } = build(420, "upright", true);
	const three = para.variants.primes.get("three");
	const xi = para.variants.primes.get("lower-xi");
	const topCvs = tops.map(top => [...three.variants.values()].find(v => v.selector["cyrl/ksi/top"] === top));
	const tailCvs = tails.map(tail => [...xi.variants.values()].find(v => v.selector["cyrl/ksi/tail"] === tail));
	assert.ok(topCvs.every(Boolean));
	assert.ok(tailCvs.every(Boolean));
	for (const name of ["cyrl/Ksi/base", "cyrl/ksi/base"]) {
		const root = glyphStore.queryByNameEnsured(name);
		for (const [i, top] of tops.entries()) {
			assert.equal(topCvs[i].get(root), `${name}.${top}.straightTailSharpCorner`);
			for (const [j, tail] of tails.entries()) {
				const selectedTop = glyphStore.queryByNameEnsured(`${name}.${top}.straightTailSharpCorner`);
				const selectedTail = glyphStore.queryByNameEnsured(`${name}.flatTopBroken.${tail}`);
				assert.equal(tailCvs[j].get(selectedTop), `${name}.${top}.${tail}`);
				assert.equal(topCvs[i].get(selectedTail), `${name}.${top}.${tail}`);
			}
		}
	}
});

for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`all ksi combinations have finite outlines at ${weight} ${slope}`, () => {
		const { glyphStore } = build(weight, slope, false);
		for (const name of ["cyrl/Ksi/base", "cyrl/ksi/base"]) {
			for (const top of tops) {
				const outlines = new Map();
				for (const tail of tails) {
					const glyphName = `${name}.${top}.${tail}`;
					const contours = outline(glyphStore.queryByNameEnsured(glyphName));
					outlines.set(tail, contours);
					assert.ok(contours.length, glyphName);
					assert.equal(contours.length, 1, `${glyphName}: detached contours`);
					for (const point of contours.flat()) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), glyphName);
					if (weight === 420 && slope === "upright" && top.startsWith("flatTopBroken")) {
						const expectedSlope = name === "cyrl/ksi/base" ? 1 : Math.tan(50 * Math.PI / 180);
						assert.ok(hasDiagonal(contours, expectedSlope), `${glyphName}: incorrect broken-top diagonal`);
					}
				}
				for (const suffix of ["", "SharpCorner"]) {
					assert.ok(
						bottomX(outlines.get(`diagonalTail${suffix}`)) > bottomX(outlines.get(`straightTail${suffix}`)),
						`${name}.${top}: mirrored diagonal tail must end to the right of the straight tail`,
					);
				}
			}
			assert.notDeepEqual(
				outline(glyphStore.queryByNameEnsured(`${name}.flatTop.straightTailSharpCorner`)),
				outline(glyphStore.queryByNameEnsured(`${name}.flatTopBroken.straightTailSharpCorner`)),
			);
		}
	});
}
