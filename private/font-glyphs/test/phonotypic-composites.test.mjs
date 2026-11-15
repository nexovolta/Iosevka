import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildGlyphs } from "@iosevka/font-glyphs";
import { buildOtl } from "@iosevka/font-otl";
import * as Geom from "@iosevka/geometry";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const makePara = await getParametersT({ paramsDir });
await Geom.Init();

for (const [weight, slope, theta, sigma] of [
	[420, "upright", "diamond", "serifless"],
	[120, "italic", "cursive", "full-serifed"],
]) {
	test(`PTMN composite letters at ${weight} ${slope}`, () => {
		const para = makePara({
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			menu: {
				family: "Phonotypic Test",
				version: "34.9.0",
				width: 5,
				slope,
				weight: 400,
			},
			featureControl: { noCvSs: false, noLigation: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
					"lower-theta": theta,
					"capital-sigma": sigma,
				},
			},
		});
		const { glyphStore } = buildGlyphs(para);
		const { GSUB } = buildOtl(para, glyphStore);
		const feature = Object.values(GSUB.features).find((f) => f.tag === "PTMN");
		assert.ok(feature);
		const locl = GSUB.languages.latn_PTMN.features
			.map((name) => GSUB.features[name])
			.find((f) => f.tag === "locl");
		assert.ok(locl);
		assert.deepEqual(locl.lookups, feature.lookups);
		const substitutions = Object.assign(
			{},
			...feature.lookups.map((name) => GSUB.lookups[name].substitutions),
		);
		for (const [code, expected] of [
			[0x1df3c, "latn/thetaPalatalHook.phonotypic"],
			[0x1df24, "phonetic2{122660}{t/phoneticLeft1}{grek/theta.phonotypic}"],
			[0x01ee, "EzhCaron.phonotypic"],
		]) {
			const source = glyphStore.queryByUnicode(code);
			assert.ok(source, code.toString(16));
			const target = glyphStore.queryByNameEnsured(expected);
			const sourceName = glyphStore.queryNameOf(source);
			assert.equal(LocalizedForm.PTMN.get(source), expected);
			assert.equal(substitutions[sourceName], expected);
			assert.equal(target.advanceWidth, source.advanceWidth);
			const contours = target.geometry.toContours();
			assert.ok(contours.length);
			assert.ok(contours.flat().every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
			assert.notDeepEqual(contours, source.geometry.toContours());
		}
	});
}
