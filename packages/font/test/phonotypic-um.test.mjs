import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geom from "@iosevka/geometry";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { buildGlyphs } from "../../font-glyphs/lib/index.mjs";
import { getParametersT } from "../src/param/index.mjs";

await Geom.Init();
const makePara = await getParametersT({
	paramsDir: fileURLToPath(new URL("../../../params", import.meta.url)),
});

function crossings(glyph, y) {
	const xs = [];
	const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
	for (const contour of contours) for (const arc of contour) {
		let a = glyph.gizmo.unapply(arc.eval(0));
		for (let i = 1; i <= 64; i++) {
			const b = glyph.gizmo.unapply(arc.eval(i / 64));
			if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
				xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
			}
			a = b;
		}
	}
	return xs.sort((a, b) => a - b);
}

for (const [spacing, slope, weight, lVariant] of [
	["term", "upright", 120, null],
	["normal", "upright", 120, null],
	["normal", "upright", 420, null],
	["normal", "upright", 920, null],
	["normal", "italic", 120, null],
	["normal", "italic", 420, null],
	["normal", "italic", 920, null],
	["quasi-proportional", "italic", 920, null],
	["quasi-proportional", "upright", 420, "double-tailed"],
	["quasi-proportional", "upright", 420, "top-tailed-bottom-flat-tailed"],
]) {
	test(`PTMN um forms remain connected: ${spacing} ${slope} ${weight} ${lVariant || "default"}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "PTMN um test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", ...(lVariant && { l: lVariant }) } },
		});
		const { glyphStore } = buildGlyphs(para);
		for (const [codepoint, target, contours] of [
			[0xa771, "dum.phonotypic", 2],
			[0xa772, "lum.phonotypic", 1],
			[0xa773, "mum.phonotypic", 1],
			[0xa774, "num.phonotypic", 1],
			[0xa775, "rum.phonotypic", 1],
			[0xa777, "tum.phonotypic", 1],
			[0xa778, "um.phonotypic", 2],
		]) {
			const name = glyphStore.queryNameByUnicode(codepoint);
			assert.ok(name, `missing U+${codepoint.toString(16)}`);
			assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByNameEnsured(name)), target);
			const glyph = glyphStore.queryByNameEnsured(target);
			const outline = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			assert.equal(outline.length, contours, `${target} contains a gap or disconnected piece`);
		}
		const um = glyphStore.queryByNameEnsured("um.phonotypic");
		const lower = crossings(um, para.xHeight / 2 - 1);
		const upper = crossings(um, para.xHeight / 2 + 1);
		assert.equal(lower.length, 4);
		assert.equal(upper.length, 4);
		for (let i = 0; i < 4; i++) {
			assert.ok(Math.abs(lower[i] - upper[i]) < Math.max(3, 0.05 * para.stroke), "um stems do not align");
		}
		const mumStems = crossings(glyphStore.queryByNameEnsured("mum.phonotypic"), para.xHeight * 0.3);
		const numStems = crossings(glyphStore.queryByNameEnsured("num.phonotypic"), para.xHeight * 0.3);
		assert.ok(mumStems.length >= 2 && numStems.length >= 2);
		assert.ok(Math.abs((mumStems[1] - mumStems[0]) - (numStems[1] - numStems[0])) < 3, "mum stem weight differs from num");
		if (spacing === "quasi-proportional") {
			const margins = [];
			for (const name of ["dum", "lum", "mum", "num", "rum", "tum", "um"]) {
				const glyph = glyphStore.queryByNameEnsured(`${name}.phonotypic`);
				const points = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours()
					.flat().map(p => glyph.gizmo.unapply(p));
				const xMin = Math.min(...points.map(p => p.x));
				const xMax = Math.max(...points.map(p => p.x));
				assert.ok(Math.abs(xMin + xMax - glyph.advanceWidth) < 3, `${name} ink is not centered`);
				margins.push(xMin);
			}
			assert.ok(Math.max(...margins) - Math.min(...margins) < 3, "um forms have inconsistent side bearings");
		}
	});
}
