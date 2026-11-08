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
import * as TypoGeom from "typo-geom";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variantData = read("variants");
const suffixes = [
	"doubleStoreyHookFlatSerifless",
	"doubleStoreyHookFlatSerifed",
	"doubleStoreyHookFlatToothlessCorner",
	"doubleStoreyHookFlatToothlessRounded",
];
await Geom.Init();

function assertRightStrokesPreserved(glyphStore) {
	const byName = name => glyphStore.queryByNameEnsured(name);
	for (const [component, composite] of [["av/vRight", "av"], ["ay/yRight", "ay"]]) {
		const right = byName(component);
		const mask = byName("av/aMask");
		const joined = byName(composite);
		const outsideMask = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Difference, [right.geometry, mask.geometry]);
		assert.ok(outsideMask.toBezArcs().length, `${component}: missing right stroke`);
		const missing = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Difference, [outsideMask, joined.geometry]);
		const area = geometry => geometry.toBezArcs().reduce((total, contour) => {
			const pts = contour.flatMap(arc => Array.from({ length: 16 }, (_, i) => arc.eval(i / 16)));
			return total + Math.abs(pts.reduce((sum, p, i) => {
				const q = pts[(i + 1) % pts.length];
				return sum + p.x * q.y - q.x * p.y;
			}, 0)) / 2;
		}, 0);
		const missingArea = area(missing);
		const expectedArea = area(outsideMask);
		assert.ok(missingArea <= expectedArea * 0.001, `${component}: missing ${missingArea} of ${expectedArea} right-stroke area`);
	}
}

for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`a digraphs at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { a: "double-storey-hook-flat-serifless-curved-bar-rising", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const byName = (name) => glyphStore.queryByNameEnsured(name);
		const contours = (glyph) => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		assertRightStrokesPreserved(glyphStore);
		const leftBars = new Set();
		const rightBars = new Set();
		for (const bar of ["", "CurvedBarRising", "CurvedBarFalling", "DiagonalBar", "DiagonalBarFalling"]) {
			const ref = contours(byName(`ae/a.${suffixes[0]}${bar}`));
			const aa = contours(byName(`aa.${suffixes[0]}${bar}`)).flat();
			const left = aa.filter(p => p.x < 120 && p.y > 150 && p.y < 450);
			const right = aa.filter(p => p.x > 330 && p.y > 150 && p.y < 450);
			leftBars.add(JSON.stringify(left));
			rightBars.add(JSON.stringify(right));
			for (const suffix of suffixes) {
				for (const prefix of ["ae/a", "ao/a", "au/a", "av/a", "ay/a"]) {
					assert.deepEqual(contours(byName(`${prefix}.${suffix}${bar}`)), ref, `${prefix}.${suffix}${bar}`);
				}
				const leftOther = contours(byName(`aa.${suffix}${bar}`)).flat().filter(p => p.x < 120 && p.y > 150 && p.y < 450);
				assert.deepEqual(leftOther, left, `aa left tooth: ${suffix}${bar}`);
			}
			assert.notDeepEqual(
				contours(byName(`aa.${suffixes[0]}${bar}`)),
				contours(byName(`aa.${suffixes[3]}${bar}`)),
				`aa right tooth: ${bar}`,
			);
		}
		assert.equal(leftBars.size, 5, "aa left bar must inherit the selected slope");
		assert.equal(rightBars.size, 5, "aa right bar must inherit the selected slope");
		for (const cp of [0xe6, 0x1d02, 0xa733, 0xa735, 0xa737, 0xa739, 0xa73b, 0xa73d, 0xab31]) {
			const glyph = glyphStore.queryByUnicode(cp);
			const shape = contours(glyph);
			assert.ok(shape.length, cp.toString(16));
			for (const p of shape.flat()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), cp.toString(16));
			if (cp === 0xa739 || cp === 0xa73d) assert.equal(shape.length, 2, cp.toString(16));
			if (cp === 0xa73b) assert.equal(shape.length, 3, cp.toString(16));
		}
	});
}

for (const [weight, width, slope, a, v, y] of [
	[120, 350, "italic", "double-storey-hook-flat-serifless-curved-bar-falling", "curly-serifless", "curly-serifless"],
	[420, 500, "upright", "double-storey-hook-corner-toothless-corner-curved-bar-rising", "square-top-serifless", "straight-turn-serifless"],
	[920, 350, "italic", "double-storey-hook-flat-toothless-rounded-curved-bar-rising", "straight-serifless", "curly-turn-serifless"],
]) {
	test(`masked av/ay variants at ${weight} ${width} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "quasi-proportional", weight, width, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: true },
			variants: { design: { a, v, y, "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		assertRightStrokesPreserved(glyphStore);
		for (const cp of [0xa739, 0xa73b, 0xa73d]) {
			const glyph = glyphStore.queryByUnicode(cp);
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			const exterior = contours.filter(c => c.reduce((sum, p, i) => {
				const q = c[(i + 1) % c.length];
				return sum + p.x * q.y - q.x * p.y;
			}, 0) < 0);
			assert.equal(exterior.length, 1, `${cp.toString(16)}: detached exterior ${JSON.stringify(exterior.map(c => [Math.min(...c.map(p => p.x)), Math.max(...c.map(p => p.x)), Math.min(...c.map(p => p.y)), Math.max(...c.map(p => p.y))]))}`);
		}
	});
}
