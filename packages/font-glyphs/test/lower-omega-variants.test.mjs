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
const variantData = read("variants");
const codes = [0x3c9, 0x3d6, 0x277, 0xa7b7, 0x1df75, 0x1df77, 0x1df60];
const keys = [
	"round", "almost-flat-top", "flat-top",
	"broad", "broad-almost-flat-top", "broad-flat-top",
	"rounded-vertical-sides", "rounded-vertical-sides-almost-flat-top", "rounded-vertical-sides-flat-top",
];
await Geom.Init();

test("the omega feature does not renumber existing OpenType tags", () => {
	const oldData = structuredClone(variantData);
	delete oldData.prime["lower-omega"];
	delete oldData.prime["capital-qoppa"];
	delete oldData.prime["cyrl-capital-koppa"];
	const oldPrimes = Variant.parse(oldData, {}).primes;
	const newPrimes = Variant.parse(variantData, {}).primes;
	for (const [key, prime] of oldPrimes) {
		assert.equal(newPrimes.get(key).tag, prime.tag, key);
	}
	assert.ok(newPrimes.get("lower-omega").tag);
});

for (const [weight, slope] of [[120, "upright"], [420, "upright"], [920, "upright"], [920, "italic"]]) {
	test(`lower omega variants cover all related letters at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const prime = para.variants.primes.get("lower-omega");
		assert.deepEqual([...prime.variants.keys()], keys);
		for (const code of codes) {
			const glyph = glyphStore.queryByUnicode(code);
			assert.ok(glyph, `missing U+${code.toString(16)}`);
			const shapes = [];
			for (const variant of prime.variants.values()) {
				const name = variant.get(glyph);
				assert.ok(name, `U+${code.toString(16)}: missing ${variant.key}`);
				const target = glyphStore.queryByNameEnsured(name);
				const contours = target.geometry.toContours();
				assert.ok(contours.length && contours.every(c => c.length >= 3), `${name}: empty or degenerate`);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				assert.equal(target.advanceWidth, glyph.advanceWidth, name);
				for (const [index, previous] of shapes.entries()) {
					assert.notDeepEqual(contours, previous, `U+${code.toString(16)}: ${keys[index]} and ${variant.key} match`);
				}

				shapes.push(contours);
			}
		}
		if (slope === "upright") {
			const xHeight = calculateMetrics(para).XH;
			const omega = glyphStore.queryByUnicode(0x3c9);
			for (const [index, variant] of [...prime.variants.values()].entries()) {
				const points = glyphStore.queryByNameEnsured(variant.get(omega)).geometry.toContours().flat();
				const expected = xHeight * [0.65, 0.85, 1][index % 3];
				assert.ok(points.some(p =>
					Math.abs(p.y - expected) < 0.01 && Math.abs(p.x - omega.advanceWidth / 2) < omega.advanceWidth * 0.2
				), `${variant.key}: middle notch must reach ${expected}`);
			}
			if (weight === 120) {
				const pointsFor = key => glyphStore.queryByNameEnsured(prime.variants.get(key).get(omega)).geometry.toContours().flat();
				const armEnds = keys.slice(3, 6).map(key => Math.max(...pointsFor(key)
					.filter(p => Math.abs(p.y - xHeight) < 0.01 && p.x < omega.advanceWidth * 0.4)
					.map(p => p.x)));
				assert.ok(armEnds.every(Number.isFinite) && armEnds[0] > armEnds[1] && armEnds[1] > armEnds[2],
					`broad arms must shorten as the notch rises: ${armEnds}`);
				for (const key of keys.slice(6)) {
					const points = pointsFor(key).filter(p => p.x < omega.advanceWidth * 0.25);
					assert.ok(points.some(top => Math.abs(top.y - xHeight) < 0.01 && points.some(lower =>
						Math.abs(lower.x - top.x) < 0.01 && top.y - lower.y > xHeight * 0.4
					)), `${key}: outer stem must remain vertical from the top`);
				}
			}
		}
	});
}

test("every omega design is selected without character-variant features", () => {
	const make = (design, noCvSs) => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
			featureControl: { noCvSs },
			variants: { design: { "lower-omega": design, "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		return { para, glyphStore: buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true }).glyphStore };
	};
	const reference = make("round", false);
	const prime = reference.para.variants.primes.get("lower-omega");
	for (const key of keys) {
		const selected = make(key, true);
		const variant = prime.variants.get(key);
		for (const code of codes) {
			const ref = reference.glyphStore.queryByUnicode(code);
			const expected = reference.glyphStore.queryByNameEnsured(variant.get(ref)).geometry.toContours();
			assert.deepEqual(selected.glyphStore.queryByUnicode(code).geometry.toContours(), expected,
				`U+${code.toString(16)}: ${key}`);
		}
	}
});
