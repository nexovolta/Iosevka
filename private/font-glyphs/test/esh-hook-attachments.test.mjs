import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const readParams = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(readParams));
const variantData = readParams("variants");
const suffixes = ["compact", "cornerHooked", "sshaped", "flatTailed", "diagonalTailed", "tailed"];
await Geom.Init();

for (const [weight, slope] of [
	[120, "upright"], [120, "italic"],
	[420, "upright"], [420, "italic"],
	[920, "upright"], [920, "italic"],
]) {
	test(`esh hook attachments at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const simplify = glyph => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const baseline = glyphStore.queryByNameEnsured("eshBaseline.compact");
		const retroflex = glyphStore.queryByUnicode(0x1d98);
		assert.equal(retroflex.advanceWidth, baseline.advanceWidth);
		assert.equal(simplify(retroflex).length, 1, "retroflex esh must form one connected outline without holes");
		assert.ok(Math.min(...simplify(retroflex).flat().map(p => p.y)) < 0, "retroflex hook must extend below baseline");
		assert.deepEqual(simplify(glyphStore.queryByNameEnsured("eshHookBase.compact")), simplify(baseline));
		const tops = new Set();
		const eshShapes = new Set();
		const baselineShapes = new Set();
		const attachmentPoints = new Map();
		for (const suffix of suffixes) {
			const body = glyphStore.queryByNameEnsured(`eshHookBase.${suffix}`);
			for (const [label, prefix] of [["palatal", "eshPalatalHook"], ["retroflex", "eshRTail"]]) {
				const hooked = glyphStore.queryByNameEnsured(`${prefix}/derive{eshHookBase.${suffix}}`);
				const contours = simplify(hooked);
				assert.equal(contours.length, 1, `${suffix}: ${label} esh must form one connected outline without holes`);
				assert.ok(contours[0].length >= 3 && contours[0].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), suffix);
				assert.equal(hooked.advanceWidth, baseline.advanceWidth, suffix);
				assert.ok(Math.min(...contours[0].map(p => p.y)) < 0, `${suffix}: missing ${label} hook`);
				const below = contours[0].filter(p => p.y < -1).map(p => [p.x, p.y, p.type]);
				if (!attachmentPoints.has(label)) attachmentPoints.set(label, below);
				else assert.deepEqual(below, attachmentPoints.get(label), `${suffix}: ${label} attachment changed`);
			}
			tops.add(JSON.stringify(simplify(body)));
			eshShapes.add(JSON.stringify(simplify(glyphStore.queryByNameEnsured(`esh.${suffix}`))));
			const baselineVariant = glyphStore.queryByNameEnsured(`eshBaseline.${suffix}`);
			assert.equal(baselineVariant.advanceWidth, baseline.advanceWidth, suffix);
			assert.equal(simplify(baselineVariant).length, 1, `${suffix}: baseline esh must be connected`);
			baselineShapes.add(JSON.stringify(simplify(baselineVariant)));
		}
		assert.equal(tops.size, suffixes.length, "palatal esh must retain the selected top style");
		assert.equal(eshShapes.size, suffixes.length, "ʃ must retain all variant choices");
		assert.equal(baselineShapes.size, suffixes.length, "ꭍ must retain all variant choices");
	});
}
