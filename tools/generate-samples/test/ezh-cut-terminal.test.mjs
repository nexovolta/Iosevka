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
	["upright", "straight-vertical-cut-serifless"],
	["italic", "cursive-diagonal-cut-top-serifed"],
]) {
	test(`Ezh cut selectors and outlines: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "capital-ezh": selection, "lower-ezh": selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const outline = name => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, name);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		};
		for (const body of ["straight", "cursive"]) for (const [cut, cutSuffix] of [["vertical", "VerticalCut"], ["diagonal", "DiagonalCut"]]) {
			for (const [serif, serifSuffix] of [["serifless", "Serifless"], ["top-serifed", "TopSerifed"]]) {
				const key = `${body}-${cut}-cut-${serif}`;
				const suffix = `${body}${cutSuffix}${serifSuffix}`;
				assert.equal(primes.get("capital-ezh").variants.get(key).selector.Ezh, suffix);
				const lower = primes.get("lower-ezh").variants.get(key).selector;
				assert.equal(lower.ezh, suffix);
				assert.equal(lower["ezh/phoneticHook"], `${cut}Cut`);
				for (const family of ["Ezh", "revEzh", "smcpEzh", "ezh", "revezh", "ounce"]) {
					outline(`${family}.${suffix}`);
					assert.notEqual(path(`${family}.${suffix}`), path(`${family}.${body}${serifSuffix}`), family);
				}
				for (const family of ["ezhTail", "ezhCurlyTail", "ezhRTail", "ezhPalatalHook"])
					assert.equal(path(`${family}.${suffix}`), path(`${family}.${body}${serifSuffix}`), family);
			}
			const phoneticBody = body === "straight" ? "straightSerifless" : "cursive";
			const phonetic = `${phoneticBody}.${cut}Cut`;
			outline(`ezh/phoneticRight.${phonetic}`);
			assert.notEqual(path(`ezh/phoneticRight.${phonetic}`), path(`ezh/phoneticRight.${phoneticBody}.serifless`));
			assert.equal(path(`ezhPalatalHook/phoneticRight.${phonetic}`), path(`ezhPalatalHook/phoneticRight.${phoneticBody}.serifless`));
		}
		for (const [cp, family, prime, selector] of [
			[0x1b7, "Ezh", "capital-ezh", "Ezh"],
			[0x292, "ezh", "lower-ezh", "ezh"],
			[0x1b8, "revEzh", "capital-ezh", "Ezh"],
			[0x1b9, "revezh", "lower-ezh", "ezh"],
			[0x2125, "ounce", "lower-ezh", "ezh"],
		]) {
			const suffix = primes.get(prime).variants.get(selection).selector[selector];
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), path(`${family}.${suffix}`), family);
		}
	});
}
