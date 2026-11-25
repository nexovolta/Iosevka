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

for (const [slope, cut, suffix] of [["upright", "vertical-cut", "verticalCut"], ["italic", "diagonal-cut", "diagonalCut"]]) {
	test(`numeral, eth, pilcrow and at cut selectors and outlines: ${slope}`, async () => {
		const selection = `straight-neck-${cut}-serifless`;
		const options = {
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: {
				two: selection, five: `upright-${cut}-serifless`,
				six: `closed-${cut}`, nine: `closed-${cut}`,
				"lower-eth": `closed-${cut}`, "partial-derivative": `closed-${cut}`,
				pilcrow: cut, at: `compact-${cut}`,
				sterling: `serifless-${cut}`,
			} },
		};
		const { glyphStore } = await buildGlyphData(options);
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const checkOutline = name => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, name);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		};
		for (const [bottom, prefix] of [["serifless", "serifless"], ["serifed", "serifed"]]) {
			for (const [style, ending] of [["vertical-cut", "VerticalCut"], ["diagonal-cut", "DiagonalCut"]]) {
				const name = `${prefix}${ending}`;
				assert.equal(primes.get("sterling").variants.get(`${bottom}-${style}`).selector["currency/sterlingSign"], name);
				for (const family of ["currency/sterlingSign", "currency/liraSymbolSign"]) {
					checkOutline(`${family}.${name}`);
					assert.notEqual(path(`${family}.${name}`), path(`${family}.${prefix}`), family);
				}
			}
		}
		for (const [cp, family] of [[0xa3, "currency/sterlingSign"], [0x20a4, "currency/liraSymbolSign"]]) {
			const name = `${family}.serifless${cut === "vertical-cut" ? "VerticalCut" : "DiagonalCut"}`;
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), path(name), family);
		}
		for (const [body, bodySuffix] of [["straight-neck", "straightNeck"], ["curly-neck", "curlyNeck"]]) {
			for (const [key, arc] of [["vertical-cut", "VerticalCut"], ["diagonal-cut", "DiagonalCut"]]) {
				for (const [serif, serifSuffix] of [["serifless", "Serifless"], ["serifed", "Serifed"]]) {
					const variant = primes.get("two").variants.get(`${body}-${key}-${serif}`);
					const name = `${bodySuffix}${arc}${serifSuffix}`;
					assert.equal(variant.selector.two, name);
					assert.equal(variant.selector["two/sansSerif"], `${bodySuffix}${arc}Serifless`);
					for (const size of ["lnum", "onum"]) {
						const full = `two.${size}.${name}`;
						checkOutline(full);
						assert.notEqual(path(full), path(`two.${size}.${bodySuffix}${serifSuffix}`));
					}
					for (const derived of ["RumRotunda", "rumRotunda", "rRotundaLoop"])
						checkOutline(`${derived}.${name}`);
				}
			}
			for (const [bar, barSuffix] of [["upright", "upright"], ["oblique", "oblique"], ["more-oblique", "moreOblique"]]) {
				for (const [arc, arcSuffix, baseArc] of [
					["vertical-cut", "VerticalCut", "Arched"],
					["diagonal-cut", "DiagonalCut", "Arched"],
					["flat-vertical-cut", "FlatVerticalCut", "Flat"],
					["flat-diagonal-cut", "FlatDiagonalCut", "Flat"],
				]) {
					for (const broken of [false, true]) {
						for (const [serif, serifSuffix] of [["serifless", "Serifless"], ["serifed", "Serifed"]]) {
							const key = `${bar}-${arc}${broken ? "-broken" : ""}-${serif}`;
							const variant = primes.get("five").variants.get(key);
							const full = `${barSuffix}${arcSuffix}${broken ? "Broken" : ""}${serifSuffix}`;
							assert.equal(variant.selector.five, full, key);
							assert.equal(variant.selector["five/sansSerif"], `${barSuffix}${arcSuffix}${broken ? "Broken" : ""}Serifless`, key);
							const zhuangSuffix = `upright${arcSuffix}${serifSuffix}`;
							assert.equal(variant.selector.zhuangToneFive, zhuangSuffix, key);
							for (const size of ["lnum", "onum"]) {
								const name = `five.${size}.${full}`;
								checkOutline(name);
								assert.notEqual(path(name), path(`five.${size}.${barSuffix}${baseArc}${broken ? "Broken" : ""}${serifSuffix}`));
							}
							for (const zhuang of ["zhuangToneFive", "zhuangtonefive"])
								checkOutline(`${zhuang}.${zhuangSuffix}`);
						}
					}
					for (const [key, arc] of [["vertical-cut", "VerticalCut"], ["diagonal-cut", "DiagonalCut"]]) {
						for (const flat of [false, true]) {
							const variantKey = `closed-${key}${flat ? "-flat-bowl" : ""}`;
							const variantSuffix = `closed${arc}${flat ? "FlatBowl" : ""}`;
							const baseline = `closedContour${flat ? "FlatBowl" : ""}`;
							for (const [prime, selector] of [["six", "six"], ["nine", "nine"], ["lower-eth", "eth"], ["partial-derivative", "partial"]]) {
								const variant = primes.get(prime).variants.get(variantKey);
								assert.equal(variant.selector[selector], variantSuffix, `${prime}.${variantKey}`);
								if (prime === "lower-eth") assert.equal(variant.selector["eth/palatalBase"], baseline, variantKey);
							}
							for (const name of ["six.lnum", "nine.lnum", "nine.onum", "eth", "dInsular", "dInsular/oldBowl"]) {
								checkOutline(`${name}.${variantSuffix}`);
								assert.notEqual(path(`${name}.${variantSuffix}`), path(`${name}.${baseline}`));
							}
							for (const name of ["six.lnum", "nine.lnum", "nine.onum"]) {
								const g = glyph(`${name}.${variantSuffix}`);
								const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
								assert.equal(contours.length, 2, `${name}.${variantSuffix}`);
							}
						}
					}
				}
			}
		}
		for (const [key, variantSuffix] of [["vertical-cut", "verticalCut"], ["diagonal-cut", "diagonalCut"]]) {
			const selector = primes.get("pilcrow").variants.get(key).selector;
			for (const name of ["pilcrow", "revPilcrow"]) {
				assert.equal(selector[name], variantSuffix);
				checkOutline(`${name}.${variantSuffix}`);
				assert.notEqual(path(`${name}.${variantSuffix}`), path(`${name}.curved`));
			}
			const atSuffix = `compact${variantSuffix[0].toUpperCase()}${variantSuffix.slice(1)}`;
			assert.equal(primes.get("at").variants.get(`compact-${key}`).selector.at, atSuffix);
			checkOutline(`at.${atSuffix}`);
			assert.notEqual(path(`at.${atSuffix}`), path("at.compact"));
		}
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x32)), path(`two.lnum.straightNeck${suffix === "verticalCut" ? "VerticalCut" : "DiagonalCut"}Serifless`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x35)), path(`five.lnum.upright${suffix === "verticalCut" ? "VerticalCut" : "DiagonalCut"}Serifless`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x36)), path(`six.lnum.closed${suffix === "verticalCut" ? "VerticalCut" : "DiagonalCut"}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x39)), path(`nine.lnum.closed${suffix === "verticalCut" ? "VerticalCut" : "DiagonalCut"}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0xf0)), path(`eth.closed${suffix === "verticalCut" ? "VerticalCut" : "DiagonalCut"}`));
		assert.equal(path("eth/palatalBase"), path("eth.closedContour"));
		const { glyphStore: baselineStore } = await buildGlyphData({
			...options,
			variants: { design: { ...options.variants.design, "lower-eth": "closed-contour" } },
		});
		assert.equal(
			glyphPath(glyphStore.queryByUnicodeEnsured(0x1df2f)),
			glyphPath(baselineStore.queryByUnicodeEnsured(0x1df2f)),
		);
		assert.ok(glyphPath(glyphStore.queryByUnicodeEnsured(0x2202)));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0xb6)), path(`pilcrow.${suffix}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x204b)), path(`revPilcrow.${suffix}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x40)), path(`at.compact${suffix[0].toUpperCase()}${suffix.slice(1)}`));
		for (const cp of [0x218a, 0xa75c, 0xa75d, 0x1df94])
			assert.ok(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), cp.toString(16));
	});
}
