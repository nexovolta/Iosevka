import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geom from "@iosevka/geometry";
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

for (const spacing of ["normal", "quasi-proportional"])
	for (const slope of ["upright", "italic"])
		for (const weight of [120, 420, 920])
			for (const serifed of [false, true]) {
				test(`PTMN OU contours: ${spacing} ${slope} ${weight} ${serifed ? "serifed" : "serifless"}`, () => {
					const para = makePara({
						shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
						menu: { family: "OU test", version: "34.9.0", width: 5, slope, weight: 400 },
						featureControl: { noCvSs: true, noLigation: true },
						variants: { design: { "capital-u": serifed ? "toothed-serifed" : "toothed-serifless", u: serifed ? "toothed-serifed" : "toothed-serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
					});
					const { glyphStore } = buildGlyphs(para, {
						blockIsNeeded: id => id === "Letter-Latin-OU",
						glyphIsNeeded: id => /^(?:OU|ou|smcpOU)(?:\.|$)/.test(id),
					});
					for (const [target, top] of [
						["OU.phonotypic", para.cap],
						["ou.phonotypic", para.xHeight],
						["smcpOU.phonotypic", para.xHeight],
					]) {
						const glyph = glyphStore.queryByNameEnsured(target);
						const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
						assert.equal(contours.length, 2, `${target}: detached contours or closed lower counter`);
						const points = contours.flat().map(p => glyph.gizmo.unapply(p));
						assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
						assert.ok(Math.max(...points.map(p => p.y)) <= top + 1, `${target}: outline rises above the stems`);
						if (!serifed) {
							const a = crossings(glyph, top - 4);
							const b = crossings(glyph, top - 8);
							assert.equal(a.length, 4, `${target}: upper stem count`);
							assert.equal(b.length, 4, `${target}: upper stem count`);
							for (let i = 0; i < 4; i++) assert.ok(Math.abs(a[i] - b[i]) < 0.15, `${target}: upper stem is not straight`);
						}
					}
				});
			}
