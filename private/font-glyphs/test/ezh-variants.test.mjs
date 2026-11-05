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
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");
const hooks = ["serifless", "serifed", "inward-serifed", "flat-hooked", "corner-hooked"];
const glyphs = [
	[0x1b7, "capital-ezh"], [0x1b8, "capital-ezh"], [0xa762, "capital-ezh"],
	[0x1b9, "ezh"], [0x1ba, "ezh"], [0x292, "ezh"], [0x293, "ezh"], [0xa763, "ezh"],
];

test("ezh choices are independent and preserve earlier OpenType tags", () => {
	const oldData = structuredClone(variants);
	delete oldData.prime["capital-ezh"];
	delete oldData.prime.ezh;
	const before = Variant.parse(oldData, {}).primes;
	const after = Variant.parse(variants, {}).primes;
	for (const [key, prime] of before) assert.equal(after.get(key).tag, prime.tag, key);
	for (const key of ["capital-ezh", "ezh"]) {
		const prime = after.get(key);
		assert.equal(prime.variants.size, 20);
		for (const body of ["straight", "cursive"]) for (const hook of hooks) for (const top of ["serifless", "top-serifed"]) {
			assert.ok(prime.variants.has(`${body}-${hook}-${top}`));
		}
	}
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		featureControl: { noCvSs: true },
		variants: { design: {
			"capital-ezh": "straight-corner-hooked-top-serifed",
			ezh: "cursive-inward-serifed-serifless",
		} },
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	assert.equal(para.variantSelector.Ezh, "straightHookCornerTopSerifed");
	assert.equal(para.variantSelector.ezh, "cursiveHookInwardSerifedSerifless");
});

await Geom.Init();
for (const [label, weight, slope] of [
	["Thin", 120, "upright"], ["Regular", 420, "upright"],
	["Heavy", 920, "upright"], ["Heavy Italic", 920, "italic"],
]) {
	test(`requested ezh glyphs expose intact ${label} variants`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		for (const [code, key] of glyphs) {
			const glyph = glyphStore.queryByUnicode(code);
			assert.ok(glyph, `missing U+${code.toString(16)}`);
			const shapes = [];
			for (const variant of para.variants.primes.get(key).variants.values()) {
				const name = variant.get(glyph);
				assert.ok(name, `U+${code.toString(16)} ${variant.key}`);
				const alternate = glyphStore.queryByNameEnsured(name);
				const contours = alternate.geometry.toContours();
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				assert.equal(alternate.advanceWidth, glyph.advanceWidth, name);
				shapes.push(contours);
			}
			if (![0x1ba, 0x293].includes(code)) {
				for (let i = 0; i < 10; i += 2) for (let j = 0; j < i; j += 2) {
					assert.notDeepEqual(shapes[i], shapes[j], `U+${code.toString(16)} hook variants must differ`);
				}
			} else {
				for (let i = 2; i < 10; i += 2) {
					assert.deepEqual(shapes[i], shapes[0], `U+${code.toString(16)} must preserve its distinctive tail`);
				}
			}
			if (code !== 0xa762 && code !== 0xa763) {
				for (let i = 0; i < 20; i += 2) {
					assert.notDeepEqual(shapes[i], shapes[i + 1], `U+${code.toString(16)} top serif must be selectable`);
				}
			}
		}
		for (const [code, cKey, ezhKey] of [[0xa762, "capital-c", "capital-ezh"], [0xa763, "c", "ezh"]]) {
			const glyph = glyphStore.queryByUnicode(code);
			const cVariant = para.variants.primes.get(cKey).variants.get("corner-hooked");
			const ezhVariant = para.variants.primes.get(ezhKey).variants.get("straight-inward-serifed-top-serifed");
			const cFirst = glyphStore.queryByNameEnsured(cVariant.get(glyph));
			const ezhFirst = glyphStore.queryByNameEnsured(ezhVariant.get(glyph));
			assert.ok(ezhVariant.get(cFirst) && cVariant.get(ezhFirst), "both features must work from either intermediate glyph");
			assert.deepEqual(
				glyphStore.queryByNameEnsured(ezhVariant.get(cFirst)).geometry.toContours(),
				glyphStore.queryByNameEnsured(cVariant.get(ezhFirst)).geometry.toContours(),
				"C and ezh feature application must commute",
			);
		}
	});
}

test("ezh build-plan choices work with character variants disabled", () => {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		featureControl: { noCvSs: true },
		variants: { design: {
			"capital-ezh": "straight-corner-hooked-top-serifed",
			ezh: "cursive-inward-serifed-serifless",
			"capital-c": "flat-hooked",
			c: "corner-hooked",
			"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
		} },
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
	for (const [code, name] of [
		[0x1b7, "Ezh.straightHookCornerTopSerifed"],
		[0x292, "ezh.cursiveHookInwardSerifedSerifless"],
		[0xa762, "ZVisigothic.topFlatHook.straightHookCornerTopSerifed"],
		[0xa763, "zVisigothic.topCornerHook.cursiveHookInwardSerifedSerifless"],
	]) {
		assert.deepEqual(
			glyphStore.queryByUnicode(code).geometry.toContours(),
			glyphStore.queryByNameEnsured(name).geometry.toContours(),
		);
	}
});
