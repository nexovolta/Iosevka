import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const primes = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes;

for (const slope of ["upright", "italic"]) {
	test(`independent i j l diagonal-cut terminals: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: {
				i: "top-diagonal-cut-bottom-diagonal-cut",
				j: "top-diagonal-cut-diagonal-cut",
				l: "top-diagonal-cut-bottom-diagonal-cut",
			} },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [family, selectorName, glyphName, unicode] of [
			["i", "dotlessi", "dotlessi", 0x131],
			["j", "dotlessj", "dotlessj", 0x237],
			["l", "l", "l", 0x6c],
		]) {
			const prime = primes.get(family);
			const selections = [...prime.variants.entries()].filter(([key]) => key.includes("diagonal-cut"));
			assert.ok(selections.some(([key]) => key.startsWith("top-diagonal-cut")));
			assert.ok(selections.some(([key]) => !key.startsWith("top-diagonal-cut")));
			for (const [key, variant] of selections) {
				const name = `${glyphName}.${variant.selector[selectorName]}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, key);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), key);
			}
			const selection = family === "j" ? "top-diagonal-cut-diagonal-cut" : "top-diagonal-cut-bottom-diagonal-cut";
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(unicode)),
				path(`${glyphName}.${prime.variants.get(selection).selector[selectorName]}`));
		}
		for (const family of ["dotlessi", "l"]) {
			const both = `${family}.topDiagonalCutBottomDiagonalCut`;
			assert.notEqual(path(both), path(`${family}.topDiagonalTailedBottomDiagonalTailed`));
			assert.notEqual(path(both), path(`${family}.topTailedBottomTailed`));
		}
		for (const name of ["dotlessi.topTailedBottomTailed", "dotlessj.topTailedBottomBentHook", "l.topTailedBottomTailed", "esh.tailed"]) {
			for (const contour of glyph(name).geometry.toBezArcs()) for (const arc of contour) {
				const dx = arc.d.x - arc.a.x;
				const dy = arc.d.y - arc.a.y;
				const straight = Math.abs((arc.b.x - arc.a.x) * dy - (arc.b.y - arc.a.y) * dx) < 0.001
					&& Math.abs((arc.c.x - arc.a.x) * dy - (arc.c.y - arc.a.y) * dx) < 0.001;
				assert.ok(!(straight && Math.abs(dx) > 10 && Math.abs(Math.abs(dy) - Math.abs(dx)) < 0.001),
					`${name} has a 45-degree cut`);
			}
		}
		assert.notEqual(path("dotlessj.topDiagonalCutBottomDiagonalCut"), path("dotlessj.topDiagonalTailedBottomDiagonalTailed"));
		assert.equal(path("dotlessiRetroflexHook.topDiagonalCutBottomDiagonalCut"),
			path("dotlessiRetroflexHook.topTailedBottomTailed"));
		assert.equal(path("lPalatalHook.topDiagonalCutBottomDiagonalCut"),
			path("lPalatalHook.topTailedBottomTailed"));
		assert.equal(path("dotlessjBarHookTop.topTailedBottomBentHook"),
			glyphPath(glyphStore.queryByUnicodeEnsured(0x284)));
	});
}
