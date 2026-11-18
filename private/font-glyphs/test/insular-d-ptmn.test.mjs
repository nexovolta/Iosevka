import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

test("phonotypic insular D forms have stem hooks and omit the capital bottom serif", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const spacing of ["term", "quasi-proportional"]) {
		for (const slope of ["upright", "italic"]) {
			for (const weight of [120, 420, 920]) {
				const para = makePara({
					shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
					menu: { family: "Insular D QA", version: "34.9.0", width: 5, slope, weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
				});
				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: id => ["Letter-Latin-Upper-D", "Letter-Latin-Lower-D", "Letter-Latin-Upper-Insular-D", "Letter-Latin-Lower-Eth", "Orthography"].includes(id),
					glyphIsNeeded: id => id === "D" || id.startsWith("D.") || id === "d" || id.startsWith("d.") || id === "d/descBase" || id.startsWith("DInsular") || id.startsWith("dInsular"),
				});
				for (const [cp, target] of [[0xA779, "DInsular.phonotypic"], [0xA77A, "dInsular.phonotypic"]]) {
					assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByUnicode(cp)), target);
					const glyph = glyphStore.queryByNameEnsured(target);
					const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
					assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
					if (cp === 0xA77A) assert.ok(contours.flat().some(p => glyph.gizmo.unapply(p).y < 0), target);
					else {
						assert.equal(contours.length, 2, "capital bowl and baseline hook must remain connected");
						assert.ok(contours.flat().every(p => glyph.gizmo.unapply(p).y >= para.overshoot - 1), target);
					}
				}
				const upper = glyphStore.queryByNameEnsured("DInsular.phonotypic");
				const regularD = glyphStore.queryByNameEnsured("D");
				assert.equal(upper.advanceWidth, regularD.advanceWidth * para.advanceScaleT);
				const minX = glyph => Math.min(...new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours().flat().map(p => glyph.gizmo.unapply(p).x));
				assert.ok(minX(upper) < minX(regularD) + upper.advanceWidth - regularD.advanceWidth, "capital hook extends left of the stem");
				const outline = suffix => {
					const glyph = glyphStore.queryByNameEnsured(`DInsular.phonotypic.standard${suffix}`);
					return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				};
				assert.deepEqual(outline("BilateralSerifed"), outline("UnilateralSerifed"));

				for (const body of ["standard", "moreRounded", "diamond"]) {
					const glyph = glyphStore.queryByNameEnsured(`DInsular.phonotypic.${body}Serifless`);
					const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs()
						.map(contour => contour.flatMap(arc =>
							Array.from({ length: 60 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 60)))));
					const crossingsAt = y => {
						const xs = [];
						for (const contour of contours) {
							for (let i = 0; i < contour.length; i++) {
								const a = contour[i];
								const b = contour[(i + 1) % contour.length];
								if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
									xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
								}
							}
						}
						return xs.sort((a, b) => a - b);
					};
					const baseline = crossingsAt(2);
					const above = crossingsAt(10);
					assert.equal(baseline.length, 4, `${spacing} ${slope} ${weight} ${body}: missing tooth`);
					assert.ok(baseline[2] - baseline[1] > para.stroke * 0.1, `${body}: bowl touches hook at baseline`);
					assert.ok(above[1] > baseline[1] + 1, `${body}: palatal hook is not curved`);
				}
			}
		}
	}
});
