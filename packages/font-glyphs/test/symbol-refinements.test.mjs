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
const readParams = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(readParams),
);
const variantData = readParams("variants");
const codes = [
	0x2a33, 0x2a50, 0x2afb, 0x22d8, 0x22d9, 0x2a91, 0x2a92, 0x2a93, 0x2a94, 0x23b4, 0x23b5,
	0x23b6, 0x23dc, 0x23dd, 0x23de, 0x23df, 0x23e0, 0x23e1, 0x2972, 0x2973, 0x2974, 0x2975,
	0x2b41, 0x2b42, 0x2b47, 0x2b48, 0x2b49, 0x2b4a, 0x2b4b, 0x2b4c, 0x237c, 0x238c, 0x23af,
	0x23d0,
];

await Geom.Init();

for (const spacing of ["term", "quasi-proportional"]) {
	for (const weight of [120, 420, 920]) {
		test(`requested symbols have intact ${spacing} ${weight} geometry`, () => {
			const argv = {
				shape: { serifs: "sans", spacing, weight, width: 500, slope: "upright", slopeAngle: 0 },
				featureControl: { noCvSs: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			};
			const para = init(data, argv);
			Variant.apply(variantData, para, argv);
			const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
			const contours = code => {
				const glyph = glyphStore.queryByUnicode(code);
				assert.ok(glyph, `missing U+${code.toString(16)}`);
				const result = glyph.geometry.toContours();
				assert.ok(result.length, `empty U+${code.toString(16)}`);
				assert.ok(result.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
				return result;
			};
			for (const code of codes) contours(code);
			const span = code => {
				const points = contours(code).flat();
				return [
					Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)),
					Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)),
				];
			};
			const multiply = span(0xd7);
			const smash = span(0x2a33);
			for (let i = 0; i < 2; i++) {
				assert.ok(smash[i] / multiply[i] > 0.95 && smash[i] / multiply[i] < 1.05, `smash ${smash} vs multiply ${multiply}`);
			}
			assert.ok(
				glyphStore.queryByUnicode(0x2a50).geometry.getDependencies().includes(glyphStore.queryByUnicode(0x2a33)),
				"closed union must reference smash product",
			);
			for (const code of [0x22d8, 0x22d9, 0x2afb]) {
				assert.equal(contours(code).length, 3, `U+${code.toString(16)} must have three strokes`);
			}
			for (const code of [0x2a91, 0x2a92, 0x2a93, 0x2a94]) {
				assert.equal(contours(code).length, 4, `U+${code.toString(16)} must have four separated elements`);
			}
			for (const code of [0x2a91, 0x2a92]) {
				const components = contours(code).map(points => {
					const ys = points.map(p => p.y);
					return { top: Math.max(...ys), height: Math.max(...ys) - Math.min(...ys) };
				}).sort((a, b) => b.top - a.top);
				for (const chevron of components.slice(0, 2)) {
					assert.ok(chevron.height < span(code)[1] * 0.3, `U+${code.toString(16)} chevron is too tall`);
				}
			}
			assert.ok(span(0x237c)[1] > span(0x22c0)[1] * 0.57, "zigzag arrow is too small");
			const zigzag = contours(0x237c).flat();
			assert.ok(
				zigzag.every(p => p.x >= 0 && p.x <= glyphStore.queryByUnicode(0x237c).advanceWidth),
				"zigzag arrow exceeds its advance",
			);
			for (const [top, bottom] of [[0x23b4, 0x23b5], [0x23dc, 0x23dd], [0x23de, 0x23df], [0x23e0, 0x23e1]]) {
				const topPoints = contours(top).flat();
				const bottomPoints = contours(bottom).flat();
				const middleY = points => (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2;
				assert.ok(middleY(topPoints) < middleY(bottomPoints), `U+${top.toString(16)} must sit below U+${bottom.toString(16)}`);
			}
			const upright = contours(0x28).flat();
			const topParen = contours(0x23dc).flat();
			const uprightMid = (Math.min(...upright.map(p => p.y)) + Math.max(...upright.map(p => p.y))) / 2;
			const topMid = glyphStore.queryByUnicode(0x23dc).advanceWidth / 2;
			const uprightEdges = upright.filter(p => Math.abs(p.y - uprightMid) < 0.001).map(p => p.x);
			const topEdges = topParen.filter(p => Math.abs(p.x - topMid) < 0.001).map(p => p.y);
			assert.ok(uprightEdges.length >= 2 && topEdges.length >= 2, "parenthesis stroke edges missing");
			const uprightThickness = Math.max(...uprightEdges) - Math.min(...uprightEdges);
			const topThickness = Math.max(...topEdges) - Math.min(...topEdges);
			assert.ok(Math.abs(uprightThickness - topThickness) < 0.01, `parenthesis thickness ${topThickness} != ${uprightThickness}`);
			for (const [source, top] of [[0x28, 0x23dc], [0x7b, 0x23de], [0x3014, 0x23e0]]) {
				assert.ok(Math.abs(span(source)[0] - span(top)[1]) < 0.01, `U+${top.toString(16)} compresses upright stroke geometry`);
			}
			for (const code of [0x23de, 0x23df]) {
				assert.ok(
					glyphStore.queryByUnicode(code).geometry.getDependencies().some(g => g.identifier === "braceLeft.straight"),
					`U+${code.toString(16)} must use the smooth brace construction`,
				);
			}
		});
	}
}
