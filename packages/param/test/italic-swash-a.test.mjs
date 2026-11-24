import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geometry from "@iosevka/geometry";

import { getParametersT } from "../../font/src/param/index.mjs";

await Geometry.Init();
const makePara = await getParametersT({
	paramsDir: fileURLToPath(new URL("../../../params", import.meta.url)),
});

test("italic swash a centers its bar and inherits only the lower terminal", () => {
	const base = "aSwash.doubleStoreySerifless";
	const variants = [
		base,
		"aSwash.doubleStoreyHookFlatSeriflessDiagonalBar",
		"aSwash.doubleStoreyHookCornerSeriflessCurvedBarFalling",
		"aSwash.doubleStoreyBottomCutSerifless",
	];
	for (const spacing of ["term", "quasi-proportional"])
		for (const weight of [260, 530, 930]) {
			const para = makePara({
				shape: {
					serifs: "sans",
					spacing,
					weight,
					width: 586,
					slope: "italic",
					slopeAngle: 10,
				},
				menu: {
					family: "Swash test",
					version: "34.9.0",
					width: 5,
					slope: "italic",
					weight: 400,
				},
				featureControl: { noCvSs: true, noLigation: true },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: block => block === "Letter-Latin-Lower-A",
				glyphIsNeeded: name => variants.includes(name),
			});
			const outlines = new Map(
				variants.map(name => {
					const glyph = glyphStore.queryByNameEnsured(name);
					const contours = new Geometry.SimplifyGeometry(
						glyph.geometry,
						glyph.gizmo,
						true,
					).toBezArcs();
					assert.equal(contours.length, 3, `${spacing} ${weight} ${name}`);
					return [
						name,
						contours.map(arcs =>
							arcs.flatMap(arc =>
								Array.from({ length: 200 }, (_, i) =>
									glyph.gizmo.unapply(arc.eval(i / 200)),
								),
							),
						),
					];
				}),
			);
			const reference = JSON.stringify(outlines.get(base));
			assert.equal(JSON.stringify(outlines.get(variants[1])), reference);
			assert.equal(JSON.stringify(outlines.get(variants[2])), reference);
			assert.notEqual(JSON.stringify(outlines.get(variants[3])), reference);

			const points = outlines.get(base).flat();
			const right = Math.max(...points.map(p => p.x));
			const barEnd = points.filter(p => p.x > right - 0.01);
			const midpoint =
				(Math.min(...barEnd.map(p => p.y)) + Math.max(...barEnd.map(p => p.y))) / 2;
			assert.ok(
				Math.abs(midpoint - para.xHeight / 2) < 1,
				`${spacing} ${weight}: bar midpoint ${midpoint}`,
			);
		}
});
