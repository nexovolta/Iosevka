import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

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
					blockIsNeeded: id => id === "Letter-Latin-Insular-T" || id === "Letter-Latin-C" || id === "Orthography",
					glyphIsNeeded: id => id.startsWith("tInsular") || id.startsWith("c."),
				});

				assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByUnicode(0xa787)), "tInsular.phonotypic");
				const variants = Array.from(glyphStore.namedEntries()).filter(([name]) => name.startsWith("tInsular.phonotypic.") && name.endsWith(".symmetric"));
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
					const cName = name.slice("tInsular.phonotypic.".length).replace(/\.symmetric$/, "");
					const c = glyphStore.queryByNameEnsured(`c.${cName}`);
					const stem = new Geometry.BooleanGeometry("difference", [glyph.geometry, c.geometry]);
					const stemPoints = new Geometry.SimplifyGeometry(stem, glyph.gizmo, true).toBezArcs()
						.flatMap(c => c.flatMap(arc => Array.from({ length: 16 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 16)))));
					assert.ok(stemPoints.every(p => p.y >= para.xHeight - para.stroke / 2 - 1), `stem enters c counter: ${name}`);
					const asymmetric = glyphStore.queryByNameEnsured(name.replace(/\.symmetric$/, ".asymmetric"));
					const asymPoints = new Geometry.SimplifyGeometry(asymmetric.geometry, asymmetric.gizmo, true).toBezArcs()
						.flatMap(c => c.flatMap(arc => Array.from({ length: 16 }, (_, i) => asymmetric.gizmo.unapply(arc.eval(i / 16)))));
					const asymTop = asymPoints.filter(p => p.y > para.xHeight + (para.ascender - para.xHeight) / 2);
					assert.ok(Math.max(...asymTop.map(p => p.x)) > xMax, `asymmetric crossbar does not extend right: ${name}`);
				}
			}
		}
	}
});

test("phonotypic insular t follows the t symmetry selector", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const [t, sym] of [["bent-hook", "symmetric"], ["bent-hook-asymmetric", "asymmetric"], ["flat-hooked-asymmetric", "asymmetric"]]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
			menu: { family: "Insular T QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", t } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-Insular-T",
			glyphIsNeeded: id => id.startsWith("tInsular"),
		});
		const contours = name => {
			const glyph = glyphStore.queryByNameEnsured(name);
			return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		};
		assert.deepEqual(contours("tInsular.phonotypic"), contours(`tInsular.phonotypic.${para.variantSelector.c}.${sym}`));
	}
});
