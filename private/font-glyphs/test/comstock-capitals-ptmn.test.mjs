import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

function outline(glyph) {
	return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs()
		.map(contour => contour.flatMap(arc =>
			Array.from({ length: 32 }, (_, i) => glyph.gizmo.unapply(arc.eval(i / 32)))));
}

function crossings(contours, y) {
	const xs = [];
	for (const contour of contours) for (let i = 0; i < contour.length; i++) {
		const a = contour[i];
		const b = contour[(i + 1) % contour.length];
		if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
			xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
		}
	}
	return xs.sort((a, b) => a - b);
}

test("Comstock E-hook and capital insular T follow their components", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const designs = [
		["serifless", "serifless", "serifless"],
		["serifed-capped", "bilateral-serifed", "serifed"],
		["diagonal-crossbar-rising", "corner-hooked", "motion-serifed"],
		["diagonal-crossbar-falling", "flat-hooked", "base-serifed"],
	];
	for (const spacing of ["term", "quasi-proportional"]) for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) for (const [e, c, t] of designs) {
			const para = makePara({
				shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Comstock capitals QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", "capital-e": e, "capital-c": c, "capital-t": t } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Letter-Latin-Upper-E", "Letter-Latin-Upper-T", "Letter-Latin-C", "Letter-Latin-Insular-T", "Orthography"].includes(id),
				glyphIsNeeded: id => /^(?:EHookRight|TInsular|E(?:\.|$)|T(?:\.|$))/.test(id),
			});
			const context = `${spacing} ${slope} ${weight} ${e} ${c} ${t}`;
			for (const [cp, target, suffix] of [
				[0x1df81, "EHookRight.phonotypic", `${para.variantSelector.E}.${para.variantSelector["C/bottomSerif"]}`],
				[0xa786, "TInsular.phonotypic", `${para.variantSelector.C}.${para.variantSelector.T}`],
			]) {
				assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByUnicode(cp)), target, context);
				const glyph = glyphStore.queryByNameEnsured(target);
				const selected = glyphStore.queryByNameEnsured(`${target}.${suffix}`);
				assert.deepEqual(outline(glyph), outline(selected), context);
				const contours = outline(glyph);
				assert.equal(contours.length, 1, `${context}: ${target} must remain connected`);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), context);
			}

			const eForm = glyphStore.queryByNameEnsured("EHookRight.phonotypic");
			const eBase = glyphStore.queryByNameEnsured("E");
			assert.equal(eForm.advanceWidth, eBase.advanceWidth, context);
			const eOutline = outline(eForm);
			const leftEdges = [0.45, 0.5, 0.55].map(k => crossings(eOutline, para.cap * k)[0]);
			assert.ok(leftEdges.every(x => Number.isFinite(x) && Math.abs(x - leftEdges[1]) < 1), `${context}: E/C stem is misaligned`);
			const eTop = crossings(eOutline, para.cap * 0.75);
			const baseTop = crossings(outline(eBase), para.cap * 0.75);
			assert.ok(eTop.length === baseTop.length && eTop.every((x, i) => Math.abs(x - baseTop[i]) < 0.01), `${context}: E top changed`);

			const tForm = glyphStore.queryByNameEnsured("TInsular.phonotypic");
			const tBase = glyphStore.queryByNameEnsured("T");
			assert.equal(tForm.advanceWidth, tBase.advanceWidth, context);
			const tOutline = outline(tForm);
			const middleCrossings = crossings(tOutline, para.cap * 0.5);
			assert.equal(middleCrossings.length, 2, `${context}: unexpected T stem`);
			const originalBody = glyphStore.queryByNameEnsured("TInsular");
			const originalMiddle = crossings(outline(originalBody), para.cap * 0.5);
			assert.ok(Math.abs((middleCrossings[1] - middleCrossings[0]) - (originalMiddle[1] - originalMiddle[0])) < 1, `${context}: T stem not removed`);
			const barY = para.cap - para.stroke * 0.25;
			const formBar = crossings(tOutline, barY);
			const baseBar = crossings(outline(tBase), barY);
			assert.ok(t === "serifless" ? Math.abs(formBar[0] - baseBar[0]) < 1 : formBar[0] < baseBar[0] - 0.06 * tForm.advanceWidth, `${context}: T left bar extension`);
			assert.ok(Math.abs(formBar.at(-1) - baseBar.at(-1)) < 1, `${context}: T right bar differs`);
			const originalLeft = crossings(outline(originalBody), para.cap * 0.4)[0];
			const bodyLeft = crossings(tOutline, para.cap * 0.4)[0];
			const centeredLeft = originalLeft + (tForm.advanceWidth - originalBody.advanceWidth) / 2;
			assert.ok(t === "serifless" ? Math.abs(bodyLeft - centeredLeft) < 1 : bodyLeft > centeredLeft + 0.06 * tForm.advanceWidth, `${context}: T body offset`);
		}
	}
});
