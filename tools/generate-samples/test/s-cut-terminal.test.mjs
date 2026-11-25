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
for (const [slope, selection] of [
	["upright", "top-vertical-cut-bottom-diagonal-cut"],
	["italic", "top-diagonal-cut-bottom-vertical-cut"],
]) {
	test(`independent S cuts and sigmoid S: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "capital-s": selection, s: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const outline = name => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, name);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		};
		const styles = [
			["rounded", "Rounded"], ["serifed", "Serifed"], ["inward-serifed", "InwardSerifed"],
			["flat-hooked", "FlatHook"], ["corner-hooked", "CornerHook"],
			["vertical-cut", "VerticalCut"], ["diagonal-cut", "DiagonalCut"],
		];
		for (const [top, topSuffix] of styles) for (const [bottom, bottomSuffix] of styles) {
			if (!top.endsWith("-cut") && !bottom.endsWith("-cut")) continue;
			const key = `top-${top}-bottom-${bottom}`;
			const suffix = `top${topSuffix}Bottom${bottomSuffix}`;
			for (const [prime, field] of [["capital-s", "S"], ["s", "s"]])
				assert.equal(primes.get(prime).variants.get(key).selector[field], suffix, key);
			const tsStyle = ({ rounded: "serifless", serifed: "bilateralSerifed", "inward-serifed": "bilateralInwardSerifed",
				"flat-hooked": "flatHook", "corner-hooked": "cornerHook", "vertical-cut": "verticalCut", "diagonal-cut": "diagonalCut" })[bottom];
			assert.equal(primes.get("s").variants.get(key).selector["tsLig/lowerHalf"], tsStyle, key);
			for (const family of ["S", "s", "revS", "revs", "smcpS", "cyrl/Dzwe", "cyrl/dzwe"])
				outline(`${family}.${suffix}`);
			for (const family of ["S/dollarKernelStd", "S/dollarKernelCap"])
				outline(`${family}.${suffix}`);
		}
		const selected = primes.get("s").variants.get(selection).selector;
		assert.equal(selected["s/palatalBase"], "topRoundedBottomRounded");
		assert.equal(selected["s/palatalPhoneticRight"], "topRoundedBottomRounded");
		assert.equal(selected.sRTail, "topRoundedBottomSerifed");
		const cap = primes.get("capital-s").variants.get(selection).selector.S;
		for (const [cp, family, suffix] of [[0x53, "S", cap], [0x73, "s", selected.s],
			[0xa7d8, "SigmoidS", cap], [0xa7d9, "sigmoidS", selected.s],
			[0xa7d0, "GInsularClosed", cap], [0xa7d1, "gInsularClosed", selected.s]]) {
			const name = `${family}.${suffix}`;
			outline(name);
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), path(name), family);
		}
		const topSuffix = slope === "upright" ? "VerticalCut" : "DiagonalCut";
		for (const family of ["SSwash", "sSwash", "sCurlyTail"])
			outline(`${family}.top${topSuffix}BottomRounded`);
		outline(`currency/spesmiloSign.${cap}`);
		outline("tsLig");
		assert.equal(path("tsLig/lowerHalf"), path(`tsLig/lowerHalf.${selected["tsLig/lowerHalf"]}`));
		for (const suffix of ["serifless", "verticalCut", "diagonalCut"]) outline(`tsLig/lowerHalf.${suffix}`);
		assert.notEqual(path("tsLig/lowerHalf.verticalCut"), path("tsLig/lowerHalf.serifless"));
		assert.notEqual(path("tsLig/lowerHalf.diagonalCut"), path("tsLig/lowerHalf.serifless"));

		for (const [baseline, characters] of [
			["top-rounded-bottom-rounded", [0x1d8a]],
			["top-rounded-bottom-serifed", [0x282, 0xa7c5]],
		]) {
			const { glyphStore: reference } = await buildGlyphData({
				paramsDir,
				shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
				menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
				featureControl: { noCvSs: true },
				variants: { design: { s: baseline, "capital-s": baseline } },
			});
			for (const cp of characters)
				assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), glyphPath(reference.queryByUnicodeEnsured(cp)), `protected U+${cp.toString(16)}`);
		}
	});
}
