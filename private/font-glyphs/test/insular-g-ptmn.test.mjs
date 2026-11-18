import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

function rightStrokeAt(glyph, contours, y) {
	const xs = [];
	for (const contour of contours) {
		const points = contour.flatMap(arc =>
			Array.from({ length: 30 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 30))));
		for (let i = 0; i < points.length; i++) {
			const a = points[i];
			const b = points[(i + 1) % points.length];
			if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
				const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
				if (x > glyph.advanceWidth * 0.52) xs.push(x);
			}
		}
	}
	assert.equal(xs.length, 2, `swash transition has an extra edge at y=${y}`);
	return Math.abs(xs[0] - xs[1]);
}

test("Comstock insular G forms follow G and retain only the upper g variants", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const designs = [
		["double-storey", "doubleStoreyOpen"],
		["double-storey-open", "doubleStoreyOpen"],
		["double-storey-disjoint", "doubleStoreyOpen"],
		["double-storey-open-flat-hooked", "doubleStoreyOpen"],
		["double-storey-open-corner-hooked", "doubleStoreyOpen"],
		["double-storey-open-earless-rounded", "doubleStoreyOpenEarlessRounded"],
		["double-storey-open-flat-bowl-serifed", "doubleStoreyOpenFlatBowlSerifed"],
		["single-storey-serifless", "doubleStoreyOpenFlatBowl"],
		["single-storey-serifed", "doubleStoreyOpenFlatBowlSerifed"],
		["single-storey-earless-rounded", "doubleStoreyOpenEarlessRounded"],
		["double-circle", "doubleStoreyOpenEarlessRounded"],
	];
	for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) {
			for (const [design, expected] of designs) {
				const para = makePara({
					shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
					menu: { family: "Comstock G QA", version: "34.9.0", width: 5, slope, weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", g: design } },
				});

				assert.equal(para.variantSelector["gInsular/phonotypic"], expected);
				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: id => ["Letter-Latin-Upper-G", "Letter-Latin-Lower-G", "Letter-Latin-Insular-G", "Orthography"].includes(id),
					glyphIsNeeded: id => /^(?:GInsular|gInsular|G\.|g\.)/.test(id),
				});
				for (const [cp, target] of [[0xA77D, "GInsular.phonotypic"], [0x1D79, "gInsular.phonotypic"]]) {
					assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByUnicode(cp)), target);
					const glyph = glyphStore.queryByNameEnsured(target);
					const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
					assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), target);
					if (cp === 0x1D79) assert.equal(contours.length, 2, `${slope} ${weight} ${design}: lower G swash must remain connected`);
					assert.ok(contours.flat().some(p => glyph.gizmo.unapply(p).y < 0), `${target} swash`);
				}
				const glyph = glyphStore.queryByNameEnsured("gInsular.phonotypic");
				const expectedGlyph = glyphStore.queryByNameEnsured(`gInsular.phonotypic.${expected}`);
				const arcs = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
				const topWidth = rightStrokeAt(glyph, arcs, 0);
				const bottomWidth = rightStrokeAt(glyph, arcs, para.descender * 0.2);
				assert.ok(Math.abs(topWidth - bottomWidth) < topWidth * 0.1, `${slope} ${weight} ${design}: swash taper`);
				assert.deepEqual(
					new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours(),
					new Geometry.SimplifyGeometry(expectedGlyph.geometry, expectedGlyph.gizmo, true).toContours(),
				);
			}
		}
	}
});

test("capital Comstock G swashes remain connected across G variants", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Comstock G QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Latin-Upper-G",
				glyphIsNeeded: id => /^(?:GInsular|G\.)/.test(id),
			});
			const variants = Array.from(glyphStore.namedEntries()).filter(([name]) => name.startsWith("GInsular.phonotypic."));
			assert.ok(variants.length > 1);
			for (const [name, glyph] of variants) {
				const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.equal(contours.length, 1, `${slope} ${weight}: ${name}`);
				if (name.startsWith("GInsular.phonotypic.toothed")) {
					const rounded = glyphStore.queryByNameEnsured(name.replace(".toothed", ".toothlessRounded"));
					assert.deepEqual(contours, new Geometry.SimplifyGeometry(rounded.geometry, rounded.gizmo, true).toContours(), name);
				}
			}
		}
	}
});

test("Comstock G swashes remain connected in quasi-proportional spacing", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "quasi-proportional", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Comstock G QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Latin-Upper-G" || id === "Letter-Latin-Lower-G",
				glyphIsNeeded: id => /^(?:GInsular|gInsular)/.test(id),
			});
			for (const [name, count] of [["GInsular.phonotypic", 1], ["gInsular.phonotypic", 2]]) {
				const glyph = glyphStore.queryByNameEnsured(name);
				const geometry = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true);
				assert.equal(geometry.toContours().length, count, `${slope} ${weight}: ${name}`);
				if (count === 2) {
					const arcs = geometry.toBezArcs();
					const topWidth = rightStrokeAt(glyph, arcs, 0);
					const bottomWidth = rightStrokeAt(glyph, arcs, para.descender * 0.2);
					assert.ok(Math.abs(topWidth - bottomWidth) < topWidth * 0.1, `${slope} ${weight}: swash taper`);
				}
			}
		}
	}
});
