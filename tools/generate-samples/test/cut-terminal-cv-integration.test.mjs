import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { AnyCv } from "@iosevka/glyph/relation";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const primes = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes;
test("cut CV variants propagate to glyphs and preserve protected hook forms", async () => {
	const { para, glyphStore } = await buildGlyphData({
		paramsDir,
		shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope: "upright", slopeAngle: 0 },
		menu: { family: "Iosevka", version: "34.9.0", width: 5, slope: "upright", weight: 530 },
		featureControl: {},
	});
	assert.ok(para.enableCvSs);
	const glyph = glyphStore.queryByUnicodeEnsured(0x1be);
	for (const key of ["corner-vertical-cut", "corner-diagonal-cut"]) {
		const expected = primes.get("glottal-stop").variants.get(key);
		const cv = AnyCv.query(glyph).find(v => v.tag === expected.tag && v.rank === expected.rank);
		assert.ok(cv, key);
		const target = glyphStore.queryByNameEnsured(cv.get(glyph));
		assert.notEqual(glyphPath(target), glyphPath(glyph), key);
	}
	for (const [family, code, key, protectedCode, protectedFamily, protectedSelector] of [
		["f", 0x66, "vertical-cut-serifless", 0x1d82, "fPalatalHook", "f"],
		["f", 0x66, "vertical-cut-bottom-diagonal-cut", 0x1d82, "fPalatalHook", "f"],
		["cyrl-ef", 0x444, "top-diagonal-cut-bottom-vertical-cut", null],
		["i", 0x131, "top-diagonal-cut-bottom-diagonal-cut", null],
		["j", 0x237, "plain-top-diagonal-cut", 0x284, "dotlessjBarHookTop", "dotlessjHookTop"],
		["j", 0x237, "top-diagonal-cut-diagonal-cut", 0x284, "dotlessjBarHookTop", "dotlessjHookTop"],
		["l", 0x6c, "top-diagonal-cut-bottom-diagonal-cut", 0x1d85, "lPalatalHook", "l"],
		["capital-j", 0x4a, "vertical-cut-serifless", null],
		["r", 0x72, "diagonal-cut-serifless", 0x1d89, "rPalatalHook", "r"],
		["r", 0x72, "flat-top-vertical-cut-serifless", null],
		["r", 0x72, "earless-rounded-diagonal-cut-serifless", null],
		["t", 0x74, "vertical-cut", 0x1ab, "tPalatalHook", "t"],
		["y", 0x79, "cursive-diagonal-cut-serifless", 0x1b4, "yHookRight", "yHookRight"],
		["long-s", 0x17f, "vertical-cut-tailed", null],
		["lower-eszet", 0xdf, "traditional-diagonal-cut-serifless", null],
		["lower-esh", 0x283, "top-diagonal-cut-bottom-diagonal-cut", null],
	]) {
		const expected = primes.get(family).variants.get(key);
		const g = glyphStore.queryByUnicodeEnsured(code);
		const cv = AnyCv.query(g).find(v => v.tag === expected.tag && v.rank === expected.rank);
		assert.ok(cv, key);
		assert.notEqual(glyphPath(glyphStore.queryByNameEnsured(cv.get(g))), glyphPath(g), key);
		if (protectedCode) {
			const protectedGlyph = glyphStore.queryByUnicodeEnsured(protectedCode);
			const protectedCv = AnyCv.query(protectedGlyph).find(v => v.tag === expected.tag && v.rank === expected.rank);
			const target = protectedCv ? glyphStore.queryByNameEnsured(protectedCv.get(protectedGlyph)) : protectedGlyph;
			const reference = glyphStore.queryByNameEnsured(`${protectedFamily}.${expected.selector[protectedSelector]}`);
			assert.ok(glyphPath(target) === glyphPath(reference), key);
		}
	}
	for (const [family, code, prefix, selector] of [
		["i", 0x131, "dotlessi", "dotlessi"],
		["j", 0x237, "dotlessj", "dotlessj"],
		["l", 0x6c, "l", "l"],
		["lower-esh", 0x283, "esh", "esh"],
	]) {
		const g = glyphStore.queryByUnicodeEnsured(code);
		const cvs = AnyCv.query(g);
		for (const [key, variant] of primes.get(family).variants) {
			if (!key.includes("diagonal-cut")) continue;
			const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
			assert.ok(cv, `${family}.${key}`);
			assert.equal(glyphPath(glyphStore.queryByNameEnsured(cv.get(g))),
				glyphPath(glyphStore.queryByNameEnsured(`${prefix}.${variant.selector[selector]}`)),
				`${family}.${key}`);
		}
		for (const code of [0x1d8b, 0x1d98]) {
			const g = glyphStore.queryByUnicodeEnsured(code);
			const cvs = AnyCv.query(g);
			const compact = primes.get("lower-esh").variants.get("compact");
			const baseline = cvs.find(v => v.tag === compact.tag && v.rank === compact.rank);
			const expected = glyphPath(baseline ? glyphStore.queryByNameEnsured(baseline.get(g)) : g);
			for (const [key, variant] of primes.get("lower-esh").variants) {
				if (!key.includes("diagonal-cut")) continue;
				const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
				const target = cv ? glyphStore.queryByNameEnsured(cv.get(g)) : g;
				assert.equal(glyphPath(target), expected, `${code.toString(16)} ${key}`);
			}
		}
	}
	for (const [family, glyphNames] of [
		["f", [["f", "f", "f"], ["fHookBottom", "fHookBottom", "f"], ["fengTrill", "fengTrill", "fengTrill"], ["fPalatalHook", "f", "fPalatalHook"]]],
		["cyrl-ef", [["cyrl/ef", "cyrl/ef", "cyrl/ef"], ["cyrl/ef.BGR", "cyrl/ef.BGR", "cyrl/ef"]]],
	]) {
		for (const [glyphName, selector, source] of glyphNames) {
			const g = glyphStore.queryByNameEnsured(glyphName);
			const cvs = AnyCv.query(g);
			for (const [key, variant] of primes.get(family).variants) {
				if (family === "f" && !key.includes("bottom-vertical-cut") && !key.includes("bottom-diagonal-cut")) continue;
				if (family === "cyrl-ef" && !/(^|-)top-(straight|flat-hooked|rounded-tailed|diagonal-tailed|vertical-cut|diagonal-cut)-bottom-/.test(key)) continue;
				const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
				const target = cv ? glyphStore.queryByNameEnsured(cv.get(g)) : g;
				const expected = glyphStore.queryByNameEnsured(`${source}.${variant.selector[selector]}`);
				assert.equal(glyphPath(target), glyphPath(expected), `${glyphName} ${key}`);
			}
		}
	}
	const insular = glyphStore.queryByUnicodeEnsured(0xa77c);
	const selected = primes.get("r").variants.get("earless-corner-vertical-cut-serifless");
	const insularCv = AnyCv.query(insular).find(v => v.tag === selected.tag && v.rank === selected.rank);
	assert.ok(insularCv, "insular f CV");
	assert.ok(
		glyphPath(glyphStore.queryByNameEnsured(insularCv.get(insular)))
			=== glyphPath(glyphStore.queryByNameEnsured(`fInsular.${selected.selector["r/insularBase"]}`)),
		"insular f CV target",
	);
});
