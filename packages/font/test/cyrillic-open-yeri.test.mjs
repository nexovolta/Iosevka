import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../src/param/index.mjs";

test("open Cyrillic bowls and Komi de motion serifs follow their selectors", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Cyrillic QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: {
					"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
					"capital-p": "open-motion-serifed", "cyrl-capital-yeri": "open",
					"cyrl-yeri": "open", "cyrl-capital-yery": "open", "cyrl-yery": "open",
				} },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Yer", "Letter-Cyrillic-Yery", "Letter-Cyrillic-Upper-Komi-De-Dje"].includes(id),
				glyphIsNeeded: id => /^cyrl\/(?:Yeri|yeri|Yer|yer|Yery|yery|DeKomi)/.test(id),
			});
			const outline = name => {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				return contours;
			};
			for (const name of ["cyrl/Yeri", "cyrl/yeri", "cyrl/Yer", "cyrl/yer", "cyrl/Yery", "cyrl/yery", "cyrl/YeryBack", "cyrl/yeryBack"]) {
				const open = outline(`${name}.open`);
				const closed = outline(`${name}.corner`);
				assert.deepEqual(outline(name), open, name);
				assert.equal(open.length + 1, closed.length, `${name}: bowl must be open`);
			}
			assert.deepEqual(outline("cyrl/DeKomi"), outline("cyrl/DeKomi.openMotionSerifed"));
			assert.equal(outline("cyrl/DeKomi.openMotionSerifed").length + 1, outline("cyrl/DeKomi.closedMotionSerifed").length);
			assert.notDeepEqual(outline("cyrl/DeKomi.openMotionSerifed"), outline("cyrl/DeKomi.openSerifed"));
		}
	}
});
