import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

function outline(glyph) {
	return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs().map(contour =>
		contour.flatMap(arc => Array.from({ length: 32 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 32)))));
}

test("turned two follows oldstyle height while other hexadecimal digits stay lining", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const form of ["lining", "old-style"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Hexadecimal QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", "digit-form": form } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Digits-Two", "Digits-Three", "Digits-Four", "Digits-Five", "Digits-Six", "Digits-Seven"].includes(id),
			glyphIsNeeded: id => /^(?:two|three|four|five|six|seven|turnTwo|turnThree|revFour|turnFive|revSix|turnSeven)(?:\.|$)/.test(id),
		});
		const two = glyphStore.queryByNameEnsured("two.onum");
		const turned = glyphStore.queryByNameEnsured("turnTwo.onum");
		const boundsY = glyph => {
			const ys = outline(glyph).flat().map(p => p.y);
			return Math.max(...ys) - Math.min(...ys);
		};
		assert.ok(Math.abs(boundsY(two) - boundsY(turned)) < 1, `${form} ${slope} ${weight}: oldstyle two height`);
		assert.ok(boundsY(turned) < boundsY(glyphStore.queryByNameEnsured("turnTwo.lnum")) * 0.9, `${form}: oldstyle two must be shorter`);
		const byUnicode = glyphStore.queryByUnicode(0x218a);
		assert.deepEqual(outline(byUnicode), outline(glyphStore.queryByNameEnsured(`turnTwo.${form === "lining" ? "lnum" : "onum"}`)));
		for (const name of ["revFour", "turnFive", "revSix", "turnSeven"]) {
			assert.deepEqual(outline(glyphStore.queryByNameEnsured(`${name}.onum`)), outline(glyphStore.queryByNameEnsured(`${name}.lnum`)), `${name} ${form} ${slope} ${weight}`);
		}
	}
});
