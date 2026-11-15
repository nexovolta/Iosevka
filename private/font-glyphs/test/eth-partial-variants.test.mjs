import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import * as Geom from "@iosevka/geometry";
import { Point } from "@iosevka/geometry/point";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";
import * as TypoGeom from "typo-geom";
import { ethCrossbar } from "../../../packages/font-glyphs/eth-crossbar.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variants = read("variants");
const primes = Variant.parse(variants).primes;
const ethVariants = primes.get("lower-eth").variants;
const partialVariants = primes.get("partial-derivative").variants;

function stemCenter(arcs, y) {
	const crossings = [];
	for (const contour of arcs) {
		for (const arc of contour) {
			let a = arc.eval(0);
			for (let j = 1; j <= 32; j++) {
				const b = arc.eval(j / 32);
				if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
					crossings.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
				}
				a = b;
			}
		}
	}
	crossings.sort((a, b) => a - b);
	assert.ok(crossings.length >= 2 && crossings.length % 2 === 0);
	return (crossings.at(-1) + crossings.at(-2)) / 2;
}

await Geom.Init();

test("eth and partial expose independent matching six-based options", () => {
	for (const body of [
		"closed-contour",
		"closed-corner-hooked",
		"closed-flat-hooked",
		"closed-inward-serifed",
		"closed-serifed-hooked",
		"open-contour",
		"steep-bar",
		"straight-bar",
		"vertical-bar",
	]) {
		for (const suffix of ["", "-flat-bowl"]) {
			const name = body + suffix;
			assert.ok(ethVariants.has(name), name);
			assert.ok(partialVariants.has(name), name);
			assert.equal(
				ethVariants.get(name).selector.eth,
				partialVariants.get(name).selector.partial,
				name,
			);
		}
	}
});

for (const [weight, slope, spacing] of [
	[120, "upright", "term"],
	[420, "upright", "term"],
	[920, "upright", "term"],
	[120, "italic", "term"],
	[420, "italic", "term"],
	[920, "italic", "term"],
	[920, "italic", "quasi-proportional"],
]) {
	test(`eth crossbars and partial contours ${weight} ${slope} ${spacing}`, () => {
		const argv = {
			shape: {
				serifs: "sans",
				spacing,
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: false, noLigation: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					"lower-eth": "straight-bar",
					"partial-derivative": "vertical-bar-flat-bowl",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const metrics = calculateMetrics(para);
		assert.equal(para.variantSelector.eth, "straightBar");
		assert.equal(para.variantSelector.partial, "verticalBarFlatBowl");
		const contours = (g) =>
			new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
		assert.deepEqual(
			contours(glyphStore.queryByUnicode(0x2202)),
			contours(glyphStore.queryByNameEnsured("dInsular.verticalBarFlatBowl")),
		);
		assert.deepEqual(
			contours(glyphStore.queryByUnicode(0xf0)),
			contours(glyphStore.queryByNameEnsured("eth.straightBar")),
		);
		for (const [name, variant] of ethVariants) {
			const suffix = variant.selector.eth;
			const body = glyphStore.queryByNameEnsured(`dInsular.${suffix}`);
			const eth = glyphStore.queryByNameEnsured(`eth.${suffix}`);
			const corners = ethCrossbar(
				body,
				metrics.Ascender,
				metrics.Width,
				metrics.OverlayStroke,
			).map((p) => body.gizmo.apply(p));
			const points = [...corners, corners[0]].map((p) => Point.corner(p.x, p.y));
			const bar = new Geom.ContourSetGeometry([points]);
			const overlap = TypoGeom.Boolean.combine(
				TypoGeom.Boolean.ClipType.Intersection,
				body.geometry.toBezArcs(),
				bar.toBezArcs(),
				TypoGeom.Boolean.PolyFillType.NonZero,
				TypoGeom.Boolean.PolyFillType.NonZero,
				16384,
			);
			assert.equal(overlap.length, 1, `${name}: crossbar must meet one stem`);
			const overlapPoints = overlap.flatMap((contour) =>
				contour.flatMap((arc) => [arc.eval(0), arc.eval(0.5), arc.eval(1)]),
			);
			const y = (
				Math.min(...overlapPoints.map((p) => p.y)) +
				Math.max(...overlapPoints.map((p) => p.y))
			) / 2;
			const bodyArcs = TypoGeom.Boolean.removeOverlap(
				body.geometry.toBezArcs(),
				TypoGeom.Boolean.PolyFillType.NonZero,
				16384,
			);
			const step = Math.max(2, metrics.OverlayStroke * 0.1);
			const dx = stemCenter(bodyArcs, y + step) - stemCenter(bodyArcs, y - step);
			const dy = 2 * step;
			const bx = corners[1].x - corners[0].x;
			const by = corners[1].y - corners[0].y;
			const cosine = Math.abs(bx * dx + by * dy) / (Math.hypot(bx, by) * Math.hypot(dx, dy));
			assert.ok(cosine < 0.05, `${name}: crossbar is not perpendicular (${cosine})`);
			assert.equal(contours(eth).length, 2, `${name}: broken eth contours`);
			assert.equal(contours(body).length, 2, `${name}: broken partial contours`);
			assert.equal(eth.advanceWidth, body.advanceWidth, name);
			assert.ok(
				contours(eth).flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
				name,
			);
		}
		for (const digit of ["six", "nine"]) {
			for (const suffix of ["closedSerifedHook", "closedSerifedHookFlatBowl"]) {
				const name = `${digit}.lnum.${suffix}`;
				assert.equal(contours(glyphStore.queryByNameEnsured(name)).length, 2, name);
			}
		}
	});
}
