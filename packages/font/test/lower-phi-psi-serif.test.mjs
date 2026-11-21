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

for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`lower phi and psi top serifs are present and connected: ${slope} ${weight}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Phi psi serif test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Letter-Greek-Phi", "Letter-Greek-Psi"].includes(id),
			glyphIsNeeded: id => id.startsWith("grek/phi") || id.startsWith("grek/psi") || id.startsWith("cyrl/psi"),
		});
		const outline = name => {
			const glyph = glyphStore.queryByNameEnsured(name);
			return new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours()
				.map(contour => contour.map(point => glyph.gizmo.unapply(point)));
		};
		for (const height of ["", "ShortNeck", "ShorterNeck"]) for (const base of ["", "BaseSerifed"]) {
			const stem = `grek/phi.straight${height}`;
			const plain = outline(stem + base);
			const serifed = outline(`${stem}Top${base || "Serifed"}`);
			assert.equal(serifed.length, plain.length, stem);
			assert.notDeepEqual(serifed, plain, stem);
		}
		for (const height of ["", "shortNeck", "shorterNeck"]) {
			for (const [plain, top] of [["Serifless", "TopSerifed"], ["LeftSerifed", "TopLeftSerifed"], ["BaseSerifed", "TopBaseSerifed"], ["LeftBaseSerifed", "TopLeftBaseSerifed"]]) {
				const name = suffix => height ? `${height}${suffix}` : suffix[0].toLowerCase() + suffix.slice(1);
				for (const [prefix, tail] of [["grek/psi", ""], ["cyrl/psi", ".straight"], ["cyrl/psi", ".curly"], ["cyrl/psi", ".squareTop"]]) {
					const before = outline(`${prefix}.${name(plain)}${tail}`);
					const after = outline(`${prefix}.${name(top)}${tail}`);
					assert.equal(after.length, before.length, `${prefix}.${height}${top}${tail}`);
					assert.notDeepEqual(after, before, `${prefix}.${height}${top}${tail}`);
				}
			}
		}
	});
}
