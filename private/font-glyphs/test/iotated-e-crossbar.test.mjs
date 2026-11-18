import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

test("iotated Cyrillic E follows Cyrillic E crossbar and terminal variants", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		for (const direction of ["rising", "falling"]) for (const style of ["serifless", "middle-serifed", "flat-hooked", "corner-hooked"]) {
			const variant = `diagonal-crossbar-${direction}${style === "serifless" ? "" : `-${style}`}`;
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Iotated E QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: {
					"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
					"cyrl-capital-e": variant,
					"cyrl-e": variant,
				} },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Cyrillic-Iotated",
				glyphIsNeeded: id => /^cyrl\/(?:EIotated|eIotated)(?:\.|$)/.test(id),
			});
			for (const [name, selector, codepoint] of [
				["cyrl/EIotated", "cyrl/YeUkrainian", 0x464],
				["cyrl/eIotated", "cyrl/yeUkrainian", 0x465],
			]) {
				const suffix = para.variantSelector[selector];
				const horizontal = suffix.replace(/DiagonalCrossbar(?:Falling)?$/, "");
				assert.notEqual(suffix, horizontal);
				const contours = glyph => new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				const selected = glyphStore.queryByUnicode(codepoint);
				assert.ok(selected);
				const outline = contours(selected);
				assert.ok(outline.length && outline.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
				assert.deepEqual(outline, contours(glyphStore.queryByNameEnsured(`${name}.${suffix}`)));
				assert.notDeepEqual(outline, contours(glyphStore.queryByNameEnsured(`${name}.${horizontal}`)));
			}
		}
	}
});
