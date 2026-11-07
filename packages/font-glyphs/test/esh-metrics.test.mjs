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
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variantData = read("variants");
const suffixes = ["compact", "cornerHooked", "sshaped", "flatTailed", "diagonalTailed", "tailed"];
const bottoms = ["BentHook", "Straight", "FlatHook", "CornerHook", "DiagonalTailed", "NarrowBentHook"];
const tops = ["Serifless", "Hooky", "HookyShort", "ReverseHooky", "ReverseHookyShort", "CenterSerifed", "CenterShortSerifed", "Tailed", "FlatTailed", "SemiTailed", "DiagonalTailed"];
await Geom.Init();

function bounds(glyph) {
	const xs = [];
	for (const contour of glyph.geometry.toBezArcs()) {
		for (const arc of contour) {
			for (let i = 0; i <= 24; i++) xs.push(glyph.gizmo.unapply(arc.eval(i / 24)).x);
		}
	}
	assert.ok(xs.length);
	return [Math.min(...xs), Math.max(...xs)];
}

for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`narrow esh and serifless hooked j at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "quasi-proportional", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const byName = (name) => glyphStore.queryByNameEnsured(name);
		const contours = (glyph) => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const narrowWidth = byName("longs.flatHookTailedSerifless").advanceWidth * para.advanceScaleF;
		const hookPoints = new Map();
		for (const suffix of suffixes) {
			for (const name of [
				`esh.${suffix}`, `eshBaseline.${suffix}`, `reveshLoop.${suffix}`,
				`eshPalatalHook/derive{eshHookBase.${suffix}}`, `eshRTail/derive{eshHookBase.${suffix}}`,
			]) {
				const glyph = byName(name);
				assert.equal(glyph.advanceWidth, narrowWidth, name);
				const [min, max] = bounds(glyph);
				assert.ok(Math.abs((min + max) / 2 - narrowWidth / 2) < 0.1, `${name}: ink not centered`);
				assert.equal(contours(glyph).length, name.startsWith("reveshLoop.") ? 2 : 1, `${name}: unexpected outline`);
				if (name.startsWith("eshPalatalHook/") || name.startsWith("eshRTail/")) {
					const kind = name.split("/")[0];
					const below = contours(glyph)[0].filter((p) => p.y < -1)
						.sort((a, b) => a.y - b.y || a.x - b.x);
					const ref = hookPoints.get(kind);
					if (!ref) hookPoints.set(kind, below);
					else {
						assert.equal(below.length, ref.length, `${name}: hook points`);
						const dx = below[0].x - ref[0].x;
						for (let i = 0; i < below.length; i++) {
							assert.ok(Math.abs(below[i].x - ref[i].x - dx) <= 1, `${name}: hook shape`);
							assert.equal(below[i].y, ref[i].y, `${name}: hook height`);
							assert.equal(below[i].type, ref[i].type, `${name}: hook curve`);
						}
					}
				}
			}
		}
		for (const cp of [0x283, 0x1df0b, 0x1d8b, 0x1d98, 0xab4d, 0x1aa]) {
			assert.equal(glyphStore.queryByUnicode(cp).advanceWidth, narrowWidth, cp.toString(16));
		}
		assert.notEqual(glyphStore.queryByUnicode(0x286).advanceWidth, narrowWidth);
		for (const bottom of bottoms) {
			const ref = byName(`dotlessjBarHookTop.topSeriflessBottom${bottom}`);
			assert.equal(contours(ref).length, 1, `${bottom}: disconnected top hook`);
			for (const top of tops) {
				const glyph = byName(`dotlessjBarHookTop.top${top}Bottom${bottom}`);
				assert.equal(glyph.advanceWidth, ref.advanceWidth, `${top} ${bottom}`);
				assert.deepEqual(contours(glyph), contours(ref), `${top} ${bottom}`);
			}
			for (const [legacy, bottom] of [
				["bentHookShortSerifed", "BentHook"],
				["straightSerifed", "Straight"],
				["topFlatCornerHook", "CornerHook"],
				["topDiagDiagonalTailed", "DiagonalTailed"],
				["topTailedNarrowBentHook", "NarrowBentHook"],
			]) {
				assert.deepEqual(
					contours(byName(`dotlessjBarHookTop.${legacy}`)),
					contours(byName(`dotlessjBarHookTop.topSeriflessBottom${bottom}`)),
					legacy,
				);
			}
		}
	});
}
