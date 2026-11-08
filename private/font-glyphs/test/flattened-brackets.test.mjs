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
const readParams = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(
		readParams,
	),
);
const variantData = readParams("variants");

function build(
	spacing,
	weight,
	slope = "upright",
	metricOverride = null,
	paren = "flat-arc",
) {
	const argv = {
		shape: {
			serifs: "sans",
			spacing,
			weight,
			width: metricOverride ? 586 : 500,
			slope,
			slopeAngle: slope === "italic" ? 10 : 0,
		},
		featureControl: { noCvSs: false },
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
	if (metricOverride) applyMetricOverride(para, metricOverride, argv);
	return buildGlyphs(para, {
		blockIsNeeded: () => true,
		glyphIsNeeded: () => true,
	}).glyphStore;
}

function longestLine(contour, axis) {
	let longest = 0;
	for (let i = 0; i < contour.length; i++) {
		const a = contour[i],
			b = contour[(i + 1) % contour.length];
		if (a.type !== 0 || b.type !== 0) continue;
		if (Math.abs(a[axis] - b[axis]) < 0.001) {
			const other = axis === "x" ? "y" : "x";
			longest = Math.max(longest, Math.abs(a[other] - b[other]));
		}
	}
	return longest;
}

await Geom.Init();

for (const [label, spacing, weight, slope, metricOverride] of [
	...["term", "quasi-proportional"].flatMap((spacing) =>
		[
			["Thin", 120],
			["Regular", 420],
			["Heavy", 920],
		].map(([label, weight]) => [
			`${spacing} ${label}`,
			spacing,
			weight,
			"upright",
			null,
		]),
	),
	...[
		[260, "Thin"],
		[537, "Regular"],
		[920, "Heavy"],
	].map(([weight, label]) => [
		`Nexsevka ${label}`,
		"term",
		weight,
		"upright",
		nexsevkaMetricOverride,
	]),
	["Nexsevka Heavy Italic", "term", 920, "italic", nexsevkaMetricOverride],
]) {
	test(`flattened brackets have intact ${label} outlines`, () => {
		const store = build(spacing, weight, slope, metricOverride);
		const left = store.queryByUnicode(0x27ee);
		const right = store.queryByUnicode(0x27ef);
		assert.ok(left && right, "both Unicode brackets must exist");
		assert.equal(left.advanceWidth, right.advanceWidth);
		const [a, b] = [left, right].map((glyph) => {
			const contours = glyph.geometry.toContours();
			assert.equal(contours.length, 1, "bracket must have one contour");
			for (const point of contours[0]) {
				assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
			}
			const signedArea = contours[0].reduce((area, p, i, points) => {
				const q = points[(i + 1) % points.length];
				return area + p.x * q.y - q.x * p.y;
			}, 0);
			assert.ok(
				signedArea < 0,
				"outer contour must have clockwise winding",
			);
			return contours[0];
		});
		const top = Math.max(...a.map((p) => p.y));
		const bottom = Math.min(...a.map((p) => p.y));
		assert.ok(top > bottom);
		for (const p of a) {
			assert.ok(
				b.some(
					(q) =>
						q.type === p.type &&
						Math.abs(q.x + p.x - left.advanceWidth) < 0.001 &&
						Math.abs(q.y + p.y - top - bottom) < 0.001,
				),
				"brackets must be rotated counterparts",
			);
		}
		assert.notDeepEqual(
			a,
			store.queryByUnicode(0x28).geometry.toContours()[0],
		);
		if (slope === "upright") {
			assert.ok(
				longestLine(a, "x") > (top - bottom) * 0.5,
				"long straight side",
			);
			assert.ok(
				longestLine(a, "x") >
					longestLine(
						store.queryByUnicode(0x28).geometry.toContours()[0],
						"x",
					),
				"side must be longer than the flat-arc parenthesis",
			);
			for (const y of [top, bottom]) {
				const points = a.filter((p) => Math.abs(p.y - y) < 0.001);
				assert.ok(
					points.length >= 2 &&
						Math.max(...points.map((p) => p.x)) -
							Math.min(...points.map((p) => p.x)) >
							1,
					"terminal edge must be horizontal and nonzero",
				);
			}
			const horizontal = a.flatMap((p, i) => {
				const q = a[(i + 1) % a.length];
				return p.type === 0 &&
					q.type === 0 &&
					Math.abs(p.y - q.y) < 0.001 &&
					Math.abs(p.x - q.x) > 1
					? [[p, q]]
					: [];
			});
			assert.equal(
				horizontal.length,
				4,
				"both edges of both terminals must be straight",
			);
			const terminalStart = Math.max(
				...horizontal.map(([p, q]) => Math.min(p.x, q.x)),
			);
			const terminalLevels = horizontal.map(([p]) => p.y);
			for (const p of a.filter((p) => p.x >= terminalStart - 0.001)) {
				assert.ok(
					terminalLevels.some((y) => Math.abs(p.y - y) < 0.001),
					"terminal must not undulate",
				);
			}
		}
	});
}

test("flattened brackets do not follow the parenthesis design selector", () => {
	const flat = build("term", 420, "upright", null, "flat-arc");
	const normal = build("term", 420, "upright", null, "normal");
	for (const code of [0x27ee, 0x27ef]) {
		assert.deepEqual(
			flat.queryByUnicode(code).geometry.toContours(),
			normal.queryByUnicode(code).geometry.toContours(),
		);
	}
	assert.notDeepEqual(
		flat.queryByUnicode(0x28).geometry.toContours(),
		normal.queryByUnicode(0x28).geometry.toContours(),
	);
});
