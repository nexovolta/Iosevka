import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const styles = [
	["rounded", "Rounded"],
	["flat-hooked", "FlatHook"],
	["corner-hooked", "CornerHook"],
	["inward-serifed", "InwardSerifed"],
	["serifed-hooked", "Serifed"],
	["vertical-cut", "VerticalCut"],
	["diagonal-cut", "DiagonalCut"],
];
const variants = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("three").variants;

for (const [slope, selection] of [
	["upright", "top-vertical-cut-bottom-diagonal-cut"],
	["italic", "top-diagonal-cut-bottom-vertical-cut"],
]) {
	test(`rounded three cut selectors and outlines: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { three: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [top, topSuffix] of styles) {
			for (const [bottom, bottomSuffix] of styles) {
				if (!top.endsWith("-cut") && !bottom.endsWith("-cut")) continue;
				const key = top === bottom ? top : `top-${top}-bottom-${bottom}`;
				const selector = variants.get(key).selector;
				const suffix = `top${topSuffix}Bottom${bottomSuffix}`;
				for (const size of ["lnum", "onum"]) {
					const name = `three.${size}.${suffix}`;
					const g = glyph(name);
					const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
					assert.equal(contours.length, 1, name);
					assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
					assert.equal(path(`three.${size}.${selector.three}`), path(name), key);
					assert.equal(selector["three/sansSerif"], selector.three, key);
				}
				if (top.endsWith("-cut")) assert.equal(selector["cyrl/ksi/top"], "rounded", key);
			}
		}
		for (const [body, bodySuffix] of [["flat-top", "flatTop"], ["flat-top-broken", "flatTopBroken"]]) {
			for (const serifed of [false, true]) {
				for (const [cut, cutSuffix] of [["vertical-cut", "VerticalCut"], ["diagonal-cut", "DiagonalCut"]]) {
					const key = `${body}${serifed ? "-serifed" : ""}-${cut}`;
					const selector = variants.get(key).selector;
					const suffix = `${bodySuffix}${serifed ? "Serifed" : ""}${cutSuffix}`;
					assert.equal(selector.three, suffix, key);
					assert.equal(selector["three/sansSerif"], `${bodySuffix}${cutSuffix}`, key);
					assert.equal(selector["cyrl/ksi/top"], `${bodySuffix}${serifed ? "Serifed" : ""}`, key);
					for (const size of ["lnum", "onum"]) {
						const name = `three.${size}.${suffix}`;
						const baseline = `three.${size}.${bodySuffix}${serifed ? "Serifed" : ""}`;
						const g = glyph(name);
						const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
						assert.equal(contours.length, 1, name);
						assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
						assert.notEqual(path(name), path(baseline), name);
					}
				}
			}
		}
		const selector = variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x33)), path(`three.lnum.${selector.three}`));
		assert.ok(glyphPath(glyphStore.queryByUnicodeEnsured(0x218b)));
	});
}
