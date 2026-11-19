import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

function crossingsAt(glyph, y) {
	const xs = [];
	for (const contour of new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs()) {
		for (const arc of contour) {
			let a = glyph.gizmo.unapply(arc.eval(0));
			for (let i = 1; i <= 64; i++) {
				const b = glyph.gizmo.unapply(arc.eval(i / 64));
				if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y))
					xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
				a = b;
			}
		}
	}
	return xs.sort((a, b) => a - b);
}

test("serifed capital Omega and Latin Upsilon use T advance", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const baseWidths = new Map();
	const baseBowlStrokes = new Map();
	for (const spacing of ["term", "quasi-proportional"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Omega width QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Greek-Upper-Omega",
			glyphIsNeeded: id => /^(?:grek\/Omega|latn\/Upsilon)(?:\.|$)/.test(id),
		});
		for (const [name, scale] of [
			["grek/Omega.serifless", 1], ["grek/Omega.disjoint", 1],
			["grek/Omega.serifed", para.advanceScaleT], ["grek/Omega.disjointSerifed", para.advanceScaleT],
			["latn/Upsilon.serifless", 1], ["latn/Upsilon.serifed", para.advanceScaleT],
		]) {
			const g = glyphStore.queryByNameEnsured(name);
			assert.ok(Math.abs(g.advanceWidth - para.width * scale) < 0.001, `${name} ${spacing} ${slope} ${weight}`);
			if (name.startsWith("grek/")) {
				const anchor = g.gizmo.unapply(g.baseAnchors.grekUpperTonos);
				assert.ok(Math.abs(anchor.x - (g.advanceWidth - para.width) / 2) < 0.001, `${name}: tonos alignment`);
			}
			const contours = new Geometry.SimplifyGeometry(g.geometry, g.gizmo, true).toBezArcs();
			assert.ok(contours.flat().every(arc => Array.from({ length: 16 }, (_, i) => arc.eval(i / 16)).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))));
			if (name.endsWith(".serifed") || name.endsWith(".disjointSerifed")) {
				const xs = contours.flat().flatMap(arc => Array.from({ length: 32 }, (_, i) => g.gizmo.unapply(arc.eval(i / 32)).x));
				const inkWidth = Math.max(...xs) - Math.min(...xs);
				const key = `${name} ${slope} ${weight}`;
				if (spacing === "term") baseWidths.set(key, inkWidth);
				else assert.ok(Math.abs(inkWidth - baseWidths.get(key) * para.advanceScaleT) < 0.1, `${key}: scaled ink width`);
				const xsAtBowl = crossingsAt(g, para.cap * (name.startsWith("latn/") ? 0.3 : 0.7));
				assert.equal(xsAtBowl.length, 4, `${key}: bowl counters`);
				const strokes = [xsAtBowl[1] - xsAtBowl[0], xsAtBowl[3] - xsAtBowl[2]];
				if (spacing === "term") baseBowlStrokes.set(key, strokes);
				else for (let side = 0; side < 2; side++)
					assert.ok(Math.abs(strokes[side] - baseBowlStrokes.get(key)[side]) < 0.2, `${key}: bowl stroke ${side}`);
			}
		}
	}
});
