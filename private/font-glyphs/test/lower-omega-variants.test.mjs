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
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variantData = read("variants");
const codes = [
	0x3c9, 0x3d6, 0xa7b6, 0xa7b7, 0xa7dd, 0x277, 0x1df74, 0x1df75, 0x1df76,
	0x1df77, 0x1df60,
];
const keys = [
	"round",
	"almost-flat-top",
	"flat-top",
	"broad",
	"broad-almost-flat-top",
	"broad-flat-top",
	"rounded-vertical-sides",
	"rounded-vertical-sides-almost-flat-top",
	"rounded-vertical-sides-flat-top",
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
		if (oldData.prime[key].tagKind !== "letter-append") {
			assert.equal(newPrimes.get(key).tag, prime.tag, key);
		}
	}
	assert.equal(newPrimes.get("lower-omega").tag, "VXCZ");
});

for (const [weight, slope] of [
	[120, "upright"],
	[420, "upright"],
	[920, "upright"],
	[920, "italic"],
]) {
	test(`lower omega variants cover all related letters at ${weight} ${slope}`, () => {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: false },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const prime = para.variants.primes.get("lower-omega");
		assert.deepEqual([...prime.variants.keys()], keys);
		for (const code of codes) {
			const glyph = glyphStore.queryByUnicode(code);
			assert.ok(glyph, `missing U+${code.toString(16)}`);
			const shapes = [];
			for (const variant of prime.variants.values()) {
				const name = variant.get(glyph);
				assert.ok(
					name,
					`U+${code.toString(16)}: missing ${variant.key}`,
				);
				const target = glyphStore.queryByNameEnsured(name);
				const contours = target.geometry.toContours();
				assert.ok(
					contours.length && contours.every((c) => c.length >= 3),
					`${name}: empty or degenerate`,
				);
				assert.ok(
					contours
						.flat()
						.every(
							(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
						),
					name,
				);
				assert.equal(target.advanceWidth, glyph.advanceWidth, name);
				for (const [index, previous] of shapes.entries()) {
					// Closed omega uses the same vertical body for broad and vertical-side choices.
					if (
						[
							0xa7dd, 0x277, 0x1df74, 0x1df75, 0x1df76, 0x1df77,
						].includes(code) &&
						index >= 3 &&
						index % 3 === shapes.length % 3
					) {
						assert.deepEqual(
							contours,
							previous,
							`U+${code.toString(16)}: ${keys[index]} and ${variant.key} differ`,
						);
					} else {
						assert.notDeepEqual(
							contours,
							previous,
							`U+${code.toString(16)}: ${keys[index]} and ${variant.key} match`,
						);
					}
				}

				shapes.push(contours);
			}
		}
		if (slope === "upright") {
			const { XH: xHeight, CAP: capHeight } = calculateMetrics(para);
			const omega = glyphStore.queryByUnicode(0x3c9);
			for (const [index, variant] of [
				...prime.variants.values(),
			].entries()) {
				const points = glyphStore
					.queryByNameEnsured(variant.get(omega))
					.geometry.toContours()
					.flat();
				const expected = xHeight * [0.65, 0.85, 1][index % 3];
				assert.ok(
					points.some(
						(p) =>
							Math.abs(p.y - expected) < 0.01 &&
							Math.abs(p.x - omega.advanceWidth / 2) <
								omega.advanceWidth * 0.2,
					),
					`${variant.key}: middle notch must reach ${expected}`,
				);
				const capital = glyphStore.queryByUnicode(0xa7b6);
				const capitalPoints = glyphStore
					.queryByNameEnsured(variant.get(capital))
					.geometry.toContours()
					.flat();
				const capitalExpected = capHeight * [0.65, 0.85, 1][index % 3];
				assert.ok(
					capitalPoints.some(
						(p) =>
							Math.abs(p.y - capitalExpected) < 0.01 &&
							Math.abs(p.x - capital.advanceWidth / 2) <
								capital.advanceWidth * 0.2,
					),
					`${variant.key}: capital middle notch must reach ${capitalExpected}`,
				);
			}
			if (weight === 120) {
				const pointsFor = (key) =>
					glyphStore
						.queryByNameEnsured(prime.variants.get(key).get(omega))
						.geometry.toContours()
						.flat();
				const armEnds = keys.slice(3, 6).map((key) =>
					Math.max(
						...pointsFor(key)
							.filter(
								(p) =>
									Math.abs(p.y - xHeight) < 0.01 &&
									p.x < omega.advanceWidth * 0.4,
							)
							.map((p) => p.x),
					),
				);
				assert.ok(
					armEnds.every(Number.isFinite) &&
						armEnds[0] > armEnds[1] &&
						armEnds[1] > armEnds[2],
					`broad arms must shorten as the notch rises: ${armEnds}`,
				);
				for (const key of keys.slice(6)) {
					const points = pointsFor(key).filter(
						(p) => p.x < omega.advanceWidth * 0.25,
					);
					assert.ok(
						points.some(
							(top) =>
								Math.abs(top.y - xHeight) < 0.01 &&
								points.some(
									(lower) =>
										Math.abs(lower.x - top.x) < 0.01 &&
										top.y - lower.y > xHeight * 0.4,
								),
						),
						`${key}: outer stem must remain vertical from the top`,
					);
				}
			}
			for (const [code, top, turned, longLeg] of [
				[0xa7dd, capHeight, false, false],
				[0x277, xHeight, false, false],
				[0x1df74, capHeight, false, true],
				[0x1df75, xHeight, false, true],
				[0x1df76, capHeight, true, false],
				[0x1df77, xHeight, true, false],
			]) {
				const glyph = glyphStore.queryByUnicode(code);
				const pointsFor = (key) =>
					glyphStore
						.queryByNameEnsured(prime.variants.get(key).get(glyph))
						.geometry.toContours()
						.flat();
				for (let notch = 0; notch < 3; notch++) {
					const roundPoints = pointsFor(keys[notch]);
					const expectedY = roundPoints[0].y;
					if (!longLeg) {
						const expected =
							top *
							(turned
								? 1 - [0.65, 0.85, 1][notch]
								: [0.65, 0.85, 1][notch]);
						assert.ok(
							Math.abs(expectedY - expected) < 0.01,
							`U+${code.toString(16)}: ${keys[notch]} notch height`,
						);
					}
					for (const index of [notch + 3, notch + 6]) {
						const points = pointsFor(keys[index]);
						assert.ok(
							Math.abs(points[0].y - expectedY) < 0.01,
							`U+${code.toString(16)}: ${keys[index]} notch height`,
						);
						for (const side of [-1, 1]) {
							const edge = points.filter(
								(p) =>
									side * (p.x - glyph.advanceWidth / 2) > 0,
							);
							assert.ok(
								edge.some((a) =>
									edge.some(
										(b) =>
											Math.abs(a.x - b.x) < 0.05 &&
											Math.abs(a.y - b.y) > top * 0.3,
									),
								),
								`U+${code.toString(16)}: ${keys[index]} must have vertical ${side < 0 ? "left" : "right"} side`,
							);
						}
					}
				}
			}
		}
	});
}

test("every omega design is selected without character-variant features", () => {
	const make = (design, noCvSs) => {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight: 420,
				width: 500,
				slope: "upright",
				slopeAngle: 0,
			},
			featureControl: { noCvSs },
			variants: {
				design: {
					"lower-omega": design,
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		return {
			para,
			glyphStore: buildGlyphs(para, {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			}).glyphStore,
		};
	};
	const reference = make("round", false);
	const prime = reference.para.variants.primes.get("lower-omega");
	for (const key of keys) {
		const selected = make(key, true);
		const variant = prime.variants.get(key);
		for (const code of codes) {
			const ref = reference.glyphStore.queryByUnicode(code);
			const expected = reference.glyphStore
				.queryByNameEnsured(variant.get(ref))
				.geometry.toContours();
			assert.deepEqual(
				selected.glyphStore.queryByUnicode(code).geometry.toContours(),
				expected,
				`U+${code.toString(16)}: ${key}`,
			);
		}
	}
});
