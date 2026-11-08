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

await Geom.Init();

for (const [weight, slope] of [
	[120, "upright"],
	[420, "upright"],
	[920, "upright"],
	[920, "italic"],
]) {
	test(`flat arcs and palatal hooks generate valid ${weight} ${slope} outlines`, () => {
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
		const contours = (glyph) => {
			const result = glyph.geometry.toContours();
			assert.ok(result.length, `${glyph.identifier}: empty outline`);
			assert.ok(
				result.every(
					(c) =>
						c.length >= 3 &&
						c.every(
							(p) => Number.isFinite(p.x) && Number.isFinite(p.y),
						),
				),
				glyph.identifier,
			);
			return result;
		};

		for (const code of [
			0x26, 0x35, 0x37, 0x41, 0x47, 0x56, 0x61, 0x62, 0x64, 0x70, 0x540,
			0x1d80, 0x1d81, 0x1d88, 0x20ad, 0x20b3,
		]) {
			const glyph = glyphStore.queryByUnicode(code);
			assert.ok(glyph, `missing U+${code.toString(16)}`);
			contours(glyph);
		}
		for (const body of ["straight", "curly", "roundTop", "squareBottom"]) {
			const name = `currency/australSign.${body}Serifless`;
			const flat = contours(glyphStore.queryByNameEnsured(name));
			for (const diagonal of ["DiagonalBar", "DiagonalBarFalling"]) {
				assert.deepEqual(
					contours(glyphStore.queryByNameEnsured(name + diagonal)),
					flat,
					`${name}: diagonal crossbar was not removed`,
				);
			}
		}
		assert.deepEqual(
			contours(glyphStore.queryByUnicode(0x20ad)),
			contours(glyphStore.queryByNameEnsured("KBar")),
			"kip sign must follow KBar",
		);
		assert.notDeepEqual(
			contours(glyphStore.queryByNameEnsured("armn/Ho.serifed")),
			contours(glyphStore.queryByNameEnsured("armn/Ho.serifless")),
			"Armenian Ho must retain its serif variants",
		);
		for (const [primeName, code] of [
			["five", 0x35],
			["seven", 0x37],
		]) {
			const digit = glyphStore.queryByUnicode(code);
			for (const variant of para.variants.primes
				.get(primeName)
				.variants.values()) {
				const target = variant.get(digit);
				assert.ok(target, `${primeName}: missing ${variant.key}`);
				contours(glyphStore.queryByNameEnsured(target));
			}
		}

		for (const [baseName, hookName] of [
			["b", "bPalatalHook"],
			["p", "pPalatalHook"],
		]) {
			const hook = glyphStore.queryByNameEnsured(hookName);
			let checked = 0;
			for (const variant of para.variants.primes
				.get(baseName)
				.variants.values()) {
				if (!variant.key.endsWith("serifless")) continue;
				const base = glyphStore.queryByNameEnsured(
					`${baseName}.${variant.selector[baseName]}`,
				);
				const target = variant.get(hook);
				assert.ok(target, `${hookName}: missing ${variant.key}`);
				const hookedGlyph = glyphStore.queryByNameEnsured(target);
				const hookContours = contours(hookedGlyph);
				assert.ok(
					Math.min(...hookContours.flat().map((p) => p.y)) < 0,
					`${target}: missing descender`,
				);
				if (baseName === "b") {
					const anchor = base.baseAnchors.palatalHookAttach;
					assert.ok(
						anchor &&
							Number.isFinite(anchor.x) &&
							Number.isFinite(anchor.y),
						`${base.identifier}: missing hook anchor`,
					);
				}
				contours(base);
				const mergedBase = new Geom.SimplifyGeometry(
					base.geometry,
					base.gizmo,
					true,
				).toContours();
				const mergedHook = new Geom.SimplifyGeometry(
					hookedGlyph.geometry,
					hookedGlyph.gizmo,
					true,
				).toContours();
				assert.ok(
					mergedHook.length <= mergedBase.length,
					`${target}: disconnected hook`,
				);
				checked++;
			}
			assert.ok(checked >= 8, `${baseName}: insufficient bowl variants`);
		}
	});
}
