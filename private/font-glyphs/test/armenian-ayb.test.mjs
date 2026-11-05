import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");

await Geom.Init();

test("removing the turned ayb selector preserves existing feature tags", () => {
	const oldData = structuredClone(variants);
	delete oldData["reserved-letter-append-orders"];
	oldData.prime["armn-turnayb"] = {
		tagKind: "letter-append", tagOrder: 30,
		variants: { serifless: { rank: 1, selector: { "armn/turnayb": "serifless" } } },
	};
	const previous = Variant.parse(oldData, {}).primes;
	const current = Variant.parse(variants, {}).primes;
	for (const [key, prime] of current) assert.equal(prime.tag, previous.get(key).tag, key);
	for (const orders of [[30, 30], [31], [-1], [1.5]]) {
		const invalid = structuredClone(variants);
		invalid["reserved-letter-append-orders"] = orders;
		assert.throws(() => Variant.parse(invalid, {}), /reserved letter-append order/i);
	}
});

test("Armenian serif selector stages resolve to glyph variants", () => {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		featureControl: { noCvSs: false },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
	};
	const para = init(data, argv);
	Variant.apply(variants, para, argv);
	const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
	let count = 0;
	for (const [key, prime] of para.variants.primes) {
		if (!key.startsWith("armn-")) continue;
		const glyph = glyphStore.queryByUnicode(prime.sampler.codePointAt(0));
		assert.ok(glyph, key);
		assert.ok(prime.variants.has("serifless") && prime.variants.has("serifed"), key);
		for (const variant of prime.variants.values()) {
			const target = variant.get(glyph);
			assert.ok(target, `${key}: ${variant.key}`);
			assert.ok(glyphStore.queryByNameEnsured(target));
		}
		count++;
	}
	assert.equal(count, 63);
	for (const [key, code] of [["armn-capital-ayb", 0x530], ["armn-ayb", 0x560]]) {
		const glyph = glyphStore.queryByUnicode(code);
		assert.ok(glyph, key);
		for (const variant of para.variants.primes.get(key).variants.values()) {
			assert.ok(variant.get(glyph), `${key}: turned ${variant.key}`);
		}
	}
	for (const [key, spur] of [
		["armn-vo", "top-left"], ["armn-ben", "top-left"],
		["armn-gim", "top-right"], ["armn-capital-feh", "top-center"],
	]) {
		const keys = [...para.variants.primes.get(key).variants.keys()];
		assert.ok(keys.some(k => k.includes(`${spur}-motion`)), key);
		assert.ok(!keys.some(k => k.includes(spur) && !k.includes(`${spur}-motion`)), key);
	}
});

for (const [style, weight, slope] of [
	["serifless", 120, "upright"], ["serifed", 420, "upright"],
	["serifed", 920, "upright"], ["serifed", 920, "italic"],
]) {
	test(`turned Armenian aybs and positioned vo: ${style} ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: {
				"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
				"armn-ayb": style, "armn-capital-ayb": style,
			} },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		assert.ok(!para.variants.primes.has("armn-turnayb"));
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const metrics = calculateMetrics(para);
		for (const [sourceCode, turnedCode, selector, height] of [
			[0x531, 0x530, "armn-capital-ayb", metrics.CAP],
			[0x561, 0x560, "armn-ayb", metrics.XH],
		]) {
			const source = glyphStore.queryByUnicode(sourceCode);
			const turned = glyphStore.queryByUnicode(turnedCode);
			assert.ok(source && turned, `${selector}: missing glyph`);
			assert.equal(turned.advanceWidth, source.advanceWidth);
			const srcContours = source.geometry.toContours();
			const dstContours = turned.geometry.toContours();
			assert.ok(dstContours.length);
			assert.equal(dstContours.length, srcContours.length);
			for (let i = 0; slope === "upright" && i < srcContours.length; i++) {
				assert.equal(dstContours[i].length, srcContours[i].length);
				for (let j = 0; j < srcContours[i].length; j++) {
					assert.ok(Math.abs(dstContours[i][j].x - (source.advanceWidth - srcContours[i][j].x)) < 0.001);
					assert.ok(Math.abs(dstContours[i][j].y - (height - srcContours[i][j].y)) < 0.001);
				}
			}
			for (const variant of para.variants.primes.get(selector).variants.values()) {
				const sourceTarget = variant.get(source);
				const turnedTarget = variant.get(turned);
				assert.ok(sourceTarget && turnedTarget, `${selector}: turned glyph does not follow ${variant.key}`);
				const sourceVariant = glyphStore.queryByNameEnsured(sourceTarget);
				const turnedVariant = glyphStore.queryByNameEnsured(turnedTarget);
				const sourceShape = sourceVariant.geometry.toContours();
				const turnedShape = turnedVariant.geometry.toContours();
				assert.ok(turnedShape.length && turnedShape.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), turnedTarget);
				assert.equal(sourceShape.length, turnedShape.length, variant.key);
				for (let i = 0; slope === "upright" && i < sourceShape.length; i++) {
					assert.equal(sourceShape[i].length, turnedShape[i].length, variant.key);
					for (let j = 0; j < sourceShape[i].length; j++) {
						assert.ok(Math.abs(turnedShape[i][j].x - (sourceVariant.advanceWidth - sourceShape[i][j].x)) < 0.001, variant.key);
						assert.ok(Math.abs(turnedShape[i][j].y - (height - sourceShape[i][j].y)) < 0.001, variant.key);
					}
				}
			}
		}
		const capitalAybVariants = para.variants.primes.get("armn-capital-ayb").variants;
		assert.equal(capitalAybVariants.size, 10);
		assert.ok(capitalAybVariants.has("top-left-motion-top-right-serifed"));
		const vo = glyphStore.queryByUnicode(0x578);
		const voVariants = para.variants.primes.get("armn-vo").variants;
		assert.equal(voVariants.size, 19);
		const positioned = [];
		for (const variant of voVariants.values()) {
			const target = variant.get(vo);
			assert.ok(target, `vo: missing ${variant.key}`);
			const result = glyphStore.queryByNameEnsured(target).geometry.toContours();
			assert.ok(result.length && result.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), variant.key);
			if (variant.key !== "serifless" && variant.key !== "serifed") {
				for (const previous of positioned) assert.notDeepEqual(result, previous, `vo: ${variant.key} duplicates another positioned variant`);
				positioned.push(result);
			}
		}
		assert.equal(positioned.length, 17);
		assert.ok(voVariants.has("top-left-motion-bottom-left-bottom-right-motion-serifed"));
		const eh = glyphStore.queryByNameEnsured("armn/eh.serifed");
		assert.ok(eh.geometry.toContours().flat().every(p => p.y <= metrics.Ascender + 0.001), "eh top serif exceeds ascender");
	});
}
