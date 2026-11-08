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

for (const spacing of ["term", "quasi-proportional"]) {
	for (const weight of [120, 420, 920]) {
		for (const slope of ["upright", "italic"]) {
			test(`radical bottom stops above the ascender at ${spacing} ${weight} ${slope}`, () => {
				const argv = {
					shape: {
						serifs: "sans",
						spacing,
						weight,
						width: 500,
						slope,
						slopeAngle: slope === "italic" ? 9.4 : 0,
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
				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: () => true,
					glyphIsNeeded: () => true,
				});
				const encodedRadical = glyphStore.queryByUnicode(0x23b7);
				const encodedLine = glyphStore.queryByUnicode(0x2502);
				assert.equal(
					encodedRadical.advanceWidth,
					encodedLine.advanceWidth,
				);
				assert.notDeepEqual(
					encodedRadical.geometry.toContours(),
					glyphStore.queryByUnicode(0x221a).geometry.toContours(),
				);
				for (const suffix of [".NWID", ".WWID"]) {
					const radical = glyphStore.queryByNameEnsured(
						`radicalSymbolBottom${suffix}`,
					);
					const vertical = glyphStore.queryByNameEnsured(
						`uni2502${suffix}`,
					);
					const radPoints = radical.geometry.toContours().flat();
					const linePoints = vertical.geometry.toContours().flat();
					assert.ok(
						radPoints.length &&
							radPoints.every(
								(p) =>
									Number.isFinite(p.x) &&
									Number.isFinite(p.y),
							),
					);
					assert.equal(radical.advanceWidth, vertical.advanceWidth);
					const lineTop = Math.max(...linePoints.map((p) => p.y));
					const lineBottom = Math.min(...linePoints.map((p) => p.y));
					const radTop = Math.max(...radPoints.map((p) => p.y));
					assert.ok(radTop > calculateMetrics(para).Ascender);
					assert.ok(
						radTop < lineTop,
						"radical stem must stop below the cell boundary",
					);
					assert.ok(
						Math.abs(
							radTop -
								(calculateMetrics(para).Ascender * 0.75 +
									lineTop * 0.25),
						) < 0.01,
					);
					const edges = (points, y) =>
						[
							...new Set(
								points
									.filter((p) => Math.abs(p.y - y) < 0.01)
									.map((p) => p.x),
							),
						].sort((a, b) => a - b);
					const radicalEdges = edges(radPoints, radTop);
					const lineEdges = edges(linePoints, lineBottom);
					assert.equal(radicalEdges.length, 2);
					assert.equal(lineEdges.length, 2);
					for (let i = 0; i < 2; i++) {
						assert.ok(
							Math.abs(radicalEdges[i] - lineEdges[i]) < 0.01,
							"radical stem must retain the box line's center and weight",
						);
					}
				}
			});
		}
	}
}
