import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geom from "@iosevka/geometry";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
for (const [slope, cut] of [["upright", "corner-vertical-cut"], ["italic", "corner-diagonal-cut"]]) {
	test(`inverted glottal stop with stroke follows glottal-stop: ${slope}`, async () => {
		const options = {
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
		};
		const build = async design => {
			const { glyphStore } = await buildGlyphData({ ...options, variants: { design } });
			const glyph = glyphStore.queryByUnicodeEnsured(0x1be);
			const path = glyphPath(glyph);
			assert.equal(path, glyphPath(glyphStore.queryByNameEnsured("tsLig")));
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			assert.ok(contours.length);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
			return path;
		};
		const cutPath = await build({ "glottal-stop": cut, s: "top-rounded-bottom-rounded", t: "bent-hook" });
		const otherLettersPath = await build({ "glottal-stop": cut, s: "top-diagonal-cut-bottom-vertical-cut", t: "corner-hooked-short-neck" });
		const cornerPath = await build({ "glottal-stop": "corner", s: "top-rounded-bottom-rounded", t: "bent-hook" });
		const smoothPath = await build({ "glottal-stop": "smooth", s: "top-rounded-bottom-rounded", t: "bent-hook" });
		assert.equal(cutPath, otherLettersPath);
		assert.notEqual(cutPath, cornerPath);
		assert.notEqual(cornerPath, smoothPath);
	});
}
