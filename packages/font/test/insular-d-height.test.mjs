import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../src/param/index.mjs";

test("insular d bowls reach x-height without changing the partial derivative", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Insular D QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-Lower-Eth",
			glyphIsNeeded: id => /^(?:dInsular|eth|partial)(?:\.|\/|$)/.test(id),
		});
		const contours = name => {
			const glyph = glyphStore.queryByNameEnsured(name);
			return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours()
				.map(contour => contour.map(point => glyph.gizmo.unapply(point)));
		};
		const suffixes = [
			"curlyBar",
			...["straightBar", "closedContour", "openContour", "verticalBar", "closedFlatHook", "closedCornerHook", "closedInwardSerifed", "closedSerifedHook", "steepBar"]
				.flatMap(body => [body, `${body}FlatBowl`]),
		];
		for (const suffix of suffixes) {
			const raised = contours(`dInsular.${suffix}`);
			const original = contours(`dInsular/oldBowl.${suffix}`);
			assert.equal(raised.length, 2, `${slope} ${weight} ${suffix}: bowl counter`);
			assert.equal(original.length, 2, `${slope} ${weight} ${suffix}: original counter`);
			const counterTop = shapes => Math.max(...shapes[1].map(point => point.y));
			assert.ok(
				Math.abs(counterTop(raised) - counterTop(original) - (para.xHeight - 0.6 * para.ascender)) < 0.5,
				`${slope} ${weight} ${suffix}: bowl height`,
			);
		}
		if (weight === 920) {
			for (const suffix of ["closedFlatHook", "closedFlatHookFlatBowl", "closedCornerHook", "closedCornerHookFlatBowl"]) {
				const glyph = glyphStore.queryByNameEnsured(`dInsular.${suffix}`);
				const outlines = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs()
					.map(contour => contour.flatMap(arc =>
						Array.from({ length: 80 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 80)))));
				const y = para.xHeight + para.stroke * 0.12;
				const crossings = [];
				for (const contour of outlines) for (let i = 0; i < contour.length; i++) {
					const a = contour[i];
					const b = contour[(i + 1) % contour.length];
					if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
						crossings.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
					}
				}
				crossings.sort((a, b) => a - b);
				assert.equal(crossings.length, 2, `${slope} ${suffix}: hook stem`);
				const innerX = crossings[0];
				const underside = outlines.flat().filter(point =>
					point.x < innerX - para.stroke * 0.01 && point.x > innerX - para.stroke * 0.18
					&& point.y > y && point.y < para.ascender - para.stroke * 0.5
				);
				assert.ok(underside.length, `${slope} ${suffix}: hook underside`);
				assert.ok(underside.every(point => point.y <= para.ascender - para.stroke + 0.5), `${slope} ${suffix}: hook underside spike`);
				if (suffix.startsWith("closedCornerHook")) {
					const terminal = outlines.flat().filter(point =>
						point.x < innerX - para.stroke * 0.5 && point.y > para.xHeight - para.overshoot + 1
						&& point.y < para.ascender - 1
					);
					assert.ok(terminal.length, `${slope} ${suffix}: corner terminal`);
					assert.ok(terminal.every(point => point.y >= para.xHeight - para.overshoot + para.stroke * 0.2), `${slope} ${suffix}: corner crowds the bowl`);
				}
			}
		}
		assert.deepEqual(contours("partial"), contours(`dInsular/oldBowl.${para.variantSelector.partial}`));
	}
});
