import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

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

await Geom.Init();

for (const spacing of ["term", "quasi-proportional"]) {
	for (const slope of ["upright", "italic"]) {
		test(`undo circles and arrow grow with weight: ${spacing} ${slope}`, () => {
			const circleStrokes = [];
			const arrowStrokes = [];
			const zigzagStrokes = [];
			const zigzagHeads = [];
			const checkStrokes = [];
			const deleteStrokes = [];
			for (const weight of [120, 420, 920]) {
				const argv = {
					shape: {
						serifs: "sans",
						spacing,
						weight,
						width: 500,
						slope,
						slopeAngle: slope === "italic" ? 9.4 : 0,
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
				const glyph = glyphStore.queryByUnicode(0x238c);
				const contours = glyph.geometry.toContours();
				assert.equal(
					contours.length,
					4,
					"two circles must both retain their counters",
				);
				const boxes = contours
					.map((points) => {
						assert.ok(
							points.length >= 3 &&
								points.every(
									(p) =>
										Number.isFinite(p.x) &&
										Number.isFinite(p.y),
								),
						);
						const left = Math.min(...points.map((p) => p.x));
						const right = Math.max(...points.map((p) => p.x));
						const bottom = Math.min(...points.map((p) => p.y));
						const top = Math.max(...points.map((p) => p.y));
						return {
							left,
							right,
							bottom,
							top,
							area: (right - left) * (top - bottom),
						};
					})
					.sort((a, b) => b.area - a.area);
				const [, outer, ...counters] = boxes;
				const diameter = outer.top - outer.bottom;
				const width =
					Math.max(...boxes.map((b) => b.right)) -
					Math.min(...boxes.map((b) => b.left));
				assert.ok(diameter > width * 0.36, "circles are too small");
				for (const counter of counters) {
					assert.ok(
						counter.top - counter.bottom > diameter * 0.5,
						"circle counter is too small",
					);
				}
				assert.ok(
					Math.abs(
						counters[0].top -
							counters[0].bottom -
							(counters[1].top - counters[1].bottom),
					) < 0.01,
				);
				circleStrokes.push(
					(diameter - (counters[0].top - counters[0].bottom)) / 2,
				);

				const x = glyph.advanceWidth / 2;
				const crossings = [];
				for (const contour of contours) {
					for (let i = 0; i < contour.length; i++) {
						const a = contour[i];
						const b = contour[(i + 1) % contour.length];
						if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
							const y =
								a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
							if (y > outer.top) crossings.push(y);
						}
					}
				}
				assert.equal(
					crossings.length,
					2,
					"arrow arch must cross the center as one stroke",
				);
				arrowStrokes.push(Math.abs(crossings[1] - crossings[0]));

				const pointsOf = (code) => {
					const points = glyphStore
						.queryByUnicode(code)
						.geometry.toContours()
						.flat();
					assert.ok(
						points.length &&
							points.every(
								(p) =>
									Number.isFinite(p.x) &&
									Number.isFinite(p.y),
							),
					);
					return points;
				};
				const bottomXs = (points) => {
					const bottom = Math.min(...points.map((p) => p.y));
					return [
						...new Set(
							points
								.filter((p) => Math.abs(p.y - bottom) < 0.01)
								.map((p) => p.x),
						),
					].sort((a, b) => a - b);
				};
				const zigzag = pointsOf(0x237c).map((p) => ({
					x: p.x - calculateMetrics(para).TanSlope * p.y,
					y: p.y,
				}));
				const zigzagRight = Math.max(...zigzag.map((p) => p.x));
				const rightYs = zigzag
					.filter((p) => Math.abs(p.x - zigzagRight) < 0.01)
					.map((p) => p.y);
				assert.ok(
					rightYs.length >= 2,
					"right-angle bar needs a flat end",
				);
				zigzagStrokes.push(Math.max(...rightYs) - Math.min(...rightYs));
				const headXs = bottomXs(zigzag);
				assert.ok(
					headXs.length >= 2,
					"zigzag arrowhead needs a horizontal arm",
				);
				zigzagHeads.push(headXs.at(-1) - headXs[0]);
				const checkXs = bottomXs(pointsOf(0x237b));
				assert.ok(checkXs.length >= 2);
				checkStrokes.push(checkXs.at(-1) - checkXs[0]);
				const deletion = glyphStore
					.queryByUnicode(0x2425)
					.geometry.toContours();
				assert.equal(
					deletion.length,
					3,
					"delete symbol must retain three separate strokes",
				);
				const deleteXs = bottomXs(pointsOf(0x2425));
				assert.ok(deleteXs.length >= 4);
				deleteStrokes.push(deleteXs[1] - deleteXs[0]);
			}
			for (const strokes of [
				circleStrokes,
				arrowStrokes,
				zigzagStrokes,
				zigzagHeads,
				checkStrokes,
				deleteStrokes,
			]) {
				assert.ok(
					strokes[0] < strokes[1] && strokes[1] < strokes[2],
					`stroke widths must increase: ${strokes}`,
				);
			}
		});
	}
}
