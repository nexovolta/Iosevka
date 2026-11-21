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

const blocks = [
	"Letter-Latin-Upper-E", "Letter-Latin-Upper-F", "Letter-Latin-Upper-H",
	"Letter-Latin-C", "Letter-Latin-Upper-AE-OE", "Letter-Greek-Upper-Xi",
	"Letter-Greek-Upper-Gamma", "Letter-Cyrillic-Iotated",
];
const names = [];
for (const direction of ["DiagonalCrossbar", "DiagonalCrossbarFalling"]) {
	const ef = direction[0].toLowerCase() + direction.slice(1);
	for (const glyph of ["E", "revE", "smcpE", "F", "smcpF", "AE/E", "OE/E", "smcpAE/smcpE", "smcpOE/smcpE"]) {
		names.push(`${glyph}.${ef}Capped`);
		names.push(`${glyph}.${ef}SerifedCapped`);
	}
	for (const glyph of ["HLeftHalf", "HRightHalf", "smcpHLeftHalf", "smcpHRightHalf"]) {
		names.push(`${glyph}.serifed${direction}`);
	}
	names.push(`grek/Xi.${ef}MiddleSerifed`, `grek/Digamma.${ef}Capped`);
	for (const glyph of ["cyrl/E", "cyrl/e", "cyrl/YeUkrainian", "cyrl/yeUkrainian", "cyrl/EIotated", "cyrl/eIotated"])
		for (const hook of ["serifless", "flatHook", "cornerHook", "bilateralSerifed"])
			names.push(`${glyph}.${hook}Capped${direction}`);
}

for (const spacing of ["normal", "term"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`diagonal middle serifs have no flat bar joins: ${spacing} ${slope} ${weight}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Middle serif test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => blocks.includes(id),
			glyphIsNeeded: id => names.includes(id),
		});
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
			assert.ok(contours.length, name);
			const top = name.startsWith("smcp") || /^cyrl\/[a-z]/.test(name) ? para.xHeight : para.cap;
			for (const contour of contours) for (let i = 0; i < contour.length; i++) {
				const arc = contour[i];
				const a = glyph.gizmo.unapply(arc.eval(0));
				const b = glyph.gizmo.unapply(arc.eval(1));
				const m = glyph.gizmo.unapply(arc.eval(0.5));
				if (Math.abs(b.x - a.x) < 1 || Math.abs(b.y - a.y) > 0.01 || Math.abs(m.y - a.y) > 0.01) continue;
				if (a.y < top * 0.25 || a.y > top * 0.75) continue;
				for (const neighbor of [contour[(i + contour.length - 1) % contour.length], contour[(i + 1) % contour.length]]) {
					const c = glyph.gizmo.unapply(neighbor.eval(0));
					const d = glyph.gizmo.unapply(neighbor.eval(1));
					const dx = Math.abs(d.x - c.x);
					const dy = Math.abs(d.y - c.y);
					assert.ok(!(dx > 1 && dy > 0.05 && dy / dx < 0.8), `${name}: horizontal join at ${a.y}`);
				}
			}
		}
	});
}
