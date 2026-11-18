import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../src/param/index.mjs";

function crossings(glyph, x) {
	const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
	assert.equal(contours.length, 1, "outline must be connected and have no winding holes");
	const points = contours[0].flatMap(a => Array.from({ length: 64 }, (_, i) => glyph.gizmo.unapply(a.eval(i / 64))));
	const ys = [];
	for (let i = 0; i < points.length; i++) {
		const a = points[i], b = points[(i + 1) % points.length];
		if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) ys.push(a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x));
	}
	return ys.sort((a, b) => a - b);
}

test("asymmetric Cyrillic I and small-cap reversed N vertically mirror N", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Cyrillic I QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-Upper-N",
			glyphIsNeeded: id => /^(?:N|smcpN|smcpRevN|cyrl\/I|cyrl\/i\.upright)(?:\.|$)/.test(id),
		});
		for (const [source, target, height] of [
			["N.asymmetricSerifless", "cyrl/I.asymmetricSerifless", para.cap],
			["smcpN.asymmetricSerifless", "cyrl/i.upright.asymmetricSerifless", para.xHeight],
			["smcpN.asymmetricSerifless", "smcpRevN.asymmetricSerifless", para.xHeight],
		]) {
			const n = glyphStore.queryByNameEnsured(source);
			const reversed = glyphStore.queryByNameEnsured(target);
			const a = crossings(n, n.advanceWidth / 2);
			const b = crossings(reversed, reversed.advanceWidth / 2);
			assert.equal(a.length, 2, `${source} ${slope} ${weight}`);
			assert.equal(b.length, 2, `${target} ${slope} ${weight}`);
			assert.ok(Math.abs((a[0] + a[1] + b[0] + b[1]) / 2 - height) < 1, `${target} ${slope} ${weight}: ${a} / ${b} height ${height}`);
		}
	}
});
