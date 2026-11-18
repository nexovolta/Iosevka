import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../src/param/index.mjs";

test("phonotypic insular t has a centered stem on each c variant", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const spacing of ["term", "quasi-proportional"]) {
		for (const slope of ["upright", "italic"]) {
			for (const weight of [120, 420, 920]) {
				const argv = {
					shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
					menu: { family: "Insular T QA", version: "34.9.0", width: 5, slope, weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
				};
				const para = makePara(argv);
				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: id => id === "Letter-Latin-Insular-T" || id === "Orthography",
					glyphIsNeeded: id => id.startsWith("tInsular"),
				});
				assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByUnicode(0xa787)), "tInsular.phonotypic");
				const variants = Array.from(glyphStore.namedEntries()).filter(([name]) => name.startsWith("tInsular.phonotypic."));
				assert.ok(variants.length > 1);
				for (const [name, glyph] of variants) {
					const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
					assert.ok(contours.length, name);
					const points = contours.flatMap(c => c.flatMap(arc =>
						Array.from({ length: 16 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 16)))));
					assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
					const top = points.filter(p => p.y > para.xHeight + (para.ascender - para.xHeight) / 2);
					assert.ok(top.length, name);
					const xMin = Math.min(...top.map(p => p.x));
					const xMax = Math.max(...top.map(p => p.x));
					assert.ok(Math.abs((xMin + xMax) / 2 - glyph.advanceWidth / 2) < 1, `${spacing} ${slope} ${weight} ${name}`);
					const tip = points.filter(p => p.y > para.ascender - 1);
					const tipWidth = Math.max(...tip.map(p => p.x)) - Math.min(...tip.map(p => p.x));
					assert.ok(xMax - xMin > tipWidth + 1, `missing t crossbar: ${name}`);
				}
			}
		}
	}
});
