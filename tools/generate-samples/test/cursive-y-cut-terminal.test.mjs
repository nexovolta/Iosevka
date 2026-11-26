import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { AnyCv } from "@iosevka/glyph/relation";
import { parse } from "@iosevka/param/variant";
import { Boolean as BooleanGeom } from "typo-geom";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const primes = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes;
const prime = primes.get("y");
for (const [slope, selection] of [
	["upright", "cursive-vertical-cut-serifless"],
	["italic", "cursive-flat-hump-diagonal-cut-motion-serifed"],
]) {
	test(`cursive y cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: {
				y: selection,
				"cyrl-capital-u": "cursive-diagonal-cut-serifless",
				"cyrl-u": "cursive-flat-hump-vertical-cut-motion-serifed",
				"lower-lambda": "cursive-flat-hump-diagonal-cut-bilateral-motion-serifed",
			} },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.includes("vertical-cut") && !key.includes("diagonal-cut")) continue;
			for (const family of ["y", "yCap", "yShortLeg", "yLowBar", "yBelowdot/base"]) {
				const name = `${family}.${variant.selector.y}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}

			assert.doesNotMatch(variant.selector.yHookRight, /Cut/);
			assert.match(variant.selector["y/nonCursive"], /^straight/);
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x79)), path(`y.${selector.y}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x1b4)), path(`yHookRight.${selector.yHookRight}`));
		assert.notEqual(path("y.cursiveVerticalCutSerifless"), path("y.cursiveSerifless"));
		assert.notEqual(path("y.cursiveDiagonalCutSerifless"), path("y.cursiveSerifless"));

		for (const [key, variant] of prime.variants) {
			for (const [family, selectorName, glyphFamily] of [
				["lower-lambda", "grek/lambda", "grek/lambda"],
				["lower-lambda", "latn/lambda", "grek/lambda"],
				["cyrl-capital-u", "cyrl/U", "yCap"],
				["cyrl-u", "cyrl/u", "y"],
			]) {
				const selected = primes.get(family).variants.get(key);
				assert.ok(selected, `${family}.${key}`);
				assert.equal(selected.selector[selectorName], variant.selector.y, `${family}.${key}`);
				const g = glyph(`${glyphFamily}.${selected.selector[selectorName]}`);
				assert.ok(g.geometry.toBezArcs().length, `${family}.${key} has no outline`);
			}
		}
		for (const hump of ["", "FlatHump"]) {
			for (const serif of ["Serifless", "Serifed", "MotionSerifed", "TopRightMotionSerifed", "BilateralMotionSerifed"]) {
				const suffix = `cursive${hump}VerticalCut${serif}`;
				const g = glyph(`grek/lambda.${suffix}`);
				assert.equal(
					BooleanGeom.removeOverlap(g.geometry.toBezArcs(), "nonZero", 16384).length,
					1,
					`${suffix} must have continuous joins`,
				);
			}
		}
		for (const [code, source] of [
			[0x423, "yCap.cursiveDiagonalCutSerifless"],
			[0x443, "y.cursiveFlatHumpVerticalCutMotionSerifed"],
			[0x3bb, "grek/lambda.cursiveFlatHumpDiagonalCutBilateralMotionSerifed"],
			[0xa7db, "grek/lambda.cursiveFlatHumpDiagonalCutBilateralMotionSerifed"],
		]) {
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(code)), path(source), `U+${code.toString(16)}`);
		}
	});
}

test("y-based lambda and Cyrillic u options are independently available as CVs", async () => {
	const { glyphStore } = await buildGlyphData({
		paramsDir,
		shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope: "upright", slopeAngle: 0 },
		menu: { family: "Iosevka", version: "34.9.0", width: 5, slope: "upright", weight: 530 },
		featureControl: {},
	});
	for (const [family, code, glyphFamily, selector] of [
		["lower-lambda", 0x3bb, "grek/lambda", "grek/lambda"],
		["lower-lambda", 0xa7db, "grek/lambda", "latn/lambda"],
		["cyrl-capital-u", 0x423, "yCap", "cyrl/U"],
		["cyrl-u", 0x443, "y", "cyrl/u"],
	]) {
		const base = glyphStore.queryByUnicodeEnsured(code);
		const cvs = AnyCv.query(base);
		for (const key of prime.variants.keys()) {
			const variant = primes.get(family).variants.get(key);
			const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
			assert.ok(cv, `${family}.${key} U+${code.toString(16)}`);
			assert.equal(
				glyphPath(glyphStore.queryByNameEnsured(cv.get(base))),
				glyphPath(glyphStore.queryByNameEnsured(`${glyphFamily}.${variant.selector[selector]}`)),
				`${family}.${key} U+${code.toString(16)}`,
			);
		}
	}
});
