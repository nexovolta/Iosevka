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
const readParams = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(
		readParams,
	),
);
const variantData = readParams("variants");
const primes = Variant.parse(variantData, {}).primes;
const variants = primes.get("ampersand").variants;

await Geom.Init();

test("symbol hook and serif variants are mutually exclusive", () => {
	for (const prime of ["ampersand", "at", "sterling", "pilcrow"]) {
		for (const variant of primes.get(prime).variants.values()) {
			if (variant.key.startsWith("flat-top-")) continue;
			assert.doesNotMatch(
				variant.key,
				/(flat|corner)-hook(?:ed)?.*(?:inward-)?serifed/,
				`${prime}: ${variant.key}`,
			);
		}
	}
	assert.equal(primes.get("at").variants.size, 13);
	assert.equal(primes.get("sterling").variants.size, 10);
	assert.equal(primes.get("pilcrow").variants.size, 7);
	assert.equal(variants.size, 86);
	assert.equal(variants.get("et-toothed").rank, 28);
	assert.equal(variants.get("et-serifed-toothed").rank, 33);
	const ranks = [...variants.values()].map((variant) => variant.rank);
	assert.equal(new Set(ranks).size, ranks.length);
	for (const rank of [12, 13, 14, 15]) assert.ok(!ranks.includes(rank));
});

test("reserved character-variant ranks reject invalid values and explicit collisions", () => {
	for (const reserved of [[0], [12, 12], "12"]) {
		const input = structuredClone(variantData);
		input.prime.ampersand["variants-buildup"].reservedVariantRanks =
			reserved;
		assert.throws(() => Variant.parse(input, {}), /reserved variant rank/i);
	}
	const input = structuredClone(variantData);
	input.prime.ampersand["variants-buildup"].stages[
		"closed-hook"
	].plain.variantRank = 12;
	assert.throws(() => Variant.parse(input, {}), /rank 12 is reserved/);
});

for (const [serifs, spacing, width] of [
	["sans", "term", 500],
	["slab", "term", 500],
	["sans", "quasi-proportional", 600],
	["slab", "quasi-proportional", 600],
]) {
	for (const [label, weight] of [
		["Thin", 120],
		["Regular", 420],
		["Heavy", 920],
	]) {
		for (const [slope, slopeAngle] of [
			["upright", 0],
			["italic", 9.4],
		]) {
			test(`ampersand variants retain their cap: ${serifs} ${spacing} ${label} ${slope}`, () => {
				const argv = {
					shape: {
						serifs,
						spacing,
						weight,
						width,
						slope,
						slopeAngle,
					},
					featureControl: { noCvSs: true },
					variants: {
						design: {
							"capital-latin-gamma": "serifless",
							"latin-gamma": "serifless",
						},
					},
				};
				const para = init(data, argv);
				Variant.apply(variantData, para, argv);
				const filter = {
					blockIsNeeded: () => true,
					glyphIsNeeded: () => true,
				};
				const { glyphStore } = buildGlyphs(para, filter);
				const reference = glyphStore
					.queryByNameEnsured("ampersand.closed")
					.geometry.toContours();
				const capTop = Math.max(
					...reference.flat().map((point) => point.y),
				);
				for (const variant of variants.values()) {
					const name = `ampersand.${variant.selector.ampersand}`;
					const glyph = glyphStore.queryByNameEnsured(name);
					const contours = glyph.geometry.toContours();
					assert.ok(contours.length, `${variant.key} is empty`);
					let top = -Infinity;
					for (const contour of contours) {
						assert.ok(
							contour.length >= 3,
							`${variant.key} has a degenerate contour`,
						);
						for (const point of contour) {
							assert.ok(
								Number.isFinite(point.x) &&
									Number.isFinite(point.y),
								`${variant.key} has invalid coordinates`,
							);
							top = Math.max(top, point.y);
						}
					}
					assert.ok(
						top >= capTop * 0.96,
						`${variant.key} is missing its upper shape`,
					);
					if (
						variant.key.startsWith("upper-open-et-") ||
						variant.key.startsWith("closed-et-")
					) {
						const merged = new Geom.SimplifyGeometry(
							glyph.geometry,
							glyph.gizmo,
							true,
						).toContours();
						const areas = merged.map((contour) =>
							contour.reduce((sum, point, index) => {
								const next =
									contour[(index + 1) % contour.length];
								return (
									sum + point.x * next.y - next.x * point.y
								);
							}, 0),
						);
						const outer = areas.reduce(
							(a, b) => (Math.abs(a) > Math.abs(b) ? a : b),
							0,
						);
						assert.notEqual(
							outer,
							0,
							`${variant.key} has no outer contour`,
						);
						assert.equal(
							areas.filter((area) => area * outer > 0).length,
							1,
							`${variant.key} has a disconnected hybrid join`,
						);
					}
				}
				for (const prime of ["at", "sterling", "pilcrow"]) {
					for (const variant of primes.get(prime).variants.values()) {
						for (const [prefix, selector] of Object.entries(
							variant.selector,
						)) {
							const prefixes =
								prefix === "currency/sterlingSign"
									? [prefix, "currency/liraSymbolSign"]
									: [prefix];
							for (const actualPrefix of prefixes) {
								const glyph = glyphStore.queryByNameEnsured(
									`${actualPrefix}.${selector}`,
								);
								const contours = glyph.geometry.toContours();
								assert.ok(
									contours.length,
									`${prime}: ${variant.key} (${actualPrefix}) is empty`,
								);
								for (const point of contours.flat()) {
									assert.ok(
										Number.isFinite(point.x) &&
											Number.isFinite(point.y),
										`${prime}: ${variant.key} (${actualPrefix}) has invalid coordinates`,
									);
								}
							}
						}
					}
				}
				for (const [base, serifed, inward] of [
					[
						"ampersand.upperOpen",
						"ampersand.upperOpenSerifed",
						"ampersand.upperOpenInwardSerifed",
					],
					[
						"ampersand.etToothed",
						"ampersand.etSerifedToothed",
						"ampersand.etInwardSerifedToothed",
					],
					[
						"at.compact",
						"at.compactSerifed",
						"at.compactInwardSerifed",
					],
					[
						"pilcrow.curved",
						"pilcrow.serifed",
						"pilcrow.inwardSerifed",
					],
					[
						"currency/sterlingSign.serifless",
						"currency/sterlingSign.seriflessSerifed",
						"currency/sterlingSign.seriflessInwardSerifed",
					],
				]) {
					const outline = (name) =>
						glyphStore
							.queryByNameEnsured(name)
							.geometry.toContours();
					assert.notDeepEqual(
						outline(base),
						outline(serifed),
						`${serifed} must differ from ${base}`,
					);
					assert.notDeepEqual(
						outline(base),
						outline(inward),
						`${inward} must differ from ${base}`,
					);
				}
			});
		}
	}
}
