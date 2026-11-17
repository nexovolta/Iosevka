import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../src/param/index.mjs";

test("rounded and straight-stem insular D remain distinct across weights and slopes", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) {
			const argv = {
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Insular D QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			};
			const { glyphStore } = buildGlyphs(makePara(argv), { blockIsNeeded: () => true, glyphIsNeeded: () => true });
			const contours = ["rounded", "straightBowl"].map(variant => {
				const glyph = glyphStore.queryByNameEnsured(`DInsular.${variant}`);
				const result = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(result.length && result.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
				return result;
			});
			assert.notDeepEqual(contours[0], contours[1], `${weight} ${slope}`);
		}
	}
});
