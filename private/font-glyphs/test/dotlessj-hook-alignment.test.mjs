import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geometry from "@iosevka/geometry";
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

test("dotless j with stroke and hook has a continuous stem", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const spacing of ["term", "quasi-proportional"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Hooked j QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Mark-Above", "Letter-Latin-Lower-J"].includes(id),
			glyphIsNeeded: id => /^(?:dotlessj\.|dotlessjBar)/.test(id),
		});
		for (const bottom of ["BentHook", "Straight", "FlatHook", "CornerHook", "DiagonalTailed", "NarrowBentHook"]) {
			const name = `dotlessjBarHookTop.topSeriflessBottom${bottom}`;
			const glyph = glyphStore.queryByNameEnsured(name);
			const below = crossingsAt(glyph, para.xHeight - 1);
			const above = crossingsAt(glyph, para.xHeight + 1);
			const id = `${spacing} ${slope} ${weight} ${bottom}`;
			assert.equal(below.length, 2, id);
			assert.equal(above.length, 2, id);
			for (let side = 0; side < 2; side++)
				assert.ok(Math.abs(below[side] - above[side]) < 0.1, id);
		}
	}
});
