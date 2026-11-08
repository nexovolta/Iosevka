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
const epsilon = 1e-5;

await Geom.Init();

for (const [weight, slope] of [
	[260, "italic"],
	[537, "italic"],
	[920, "italic"],
	[920, "upright"],
]) {
	test(`corner hooks align and avoid folded inner corners at ${weight} ${slope}`, () => {
		const angle = slope === "italic" ? 10 : 0;
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 586,
				slope,
				slopeAngle: angle,
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
		const tangent = Math.tan((angle * Math.PI) / 180);

		for (const name of [
			"C.cornerHook",
			"f.cornerHookDiagonalTailedAsymmetricCrossbarAtHalfAscenderHeight",
		]) {
			const [arc, stub] = glyphStore
				.queryByNameEnsured(name)
				.geometry.toContours();
			const inner = arc[0];
			const outer = arc[arc.length - 2];
			assert.ok(outer.y > inner.y, `${name}: inverted hook terminal`);
			assert.ok(
				Math.abs(outer.x - inner.x - tangent * (outer.y - inner.y)) <
					epsilon,
				`${name}: terminal edge is not parallel to the italic stem`,
			);
			const index = stub.findIndex(
				(p) =>
					Math.abs(p.x - outer.x) < epsilon &&
					Math.abs(p.y - outer.y) < epsilon,
			);
			assert.notEqual(
				index,
				-1,
				`${name}: arc and stub do not meet at the outside corner`,
			);
			const next = stub[(index + 1) % (stub.length - 1)];
			assert.ok(
				next.y < inner.y,
				`${name}: stub does not extend past the arc`,
			);
			assert.ok(
				Math.abs(outer.x - next.x - tangent * (outer.y - next.y)) <
					epsilon,
				`${name}: stub edge does not align with arc`,
			);
			if (name === "C.cornerHook") {
				const [, inwardStub] = glyphStore
					.queryByNameEnsured("C.bilateralInwardSerifed")
					.geometry.toContours();
				assert.ok(
					Math.abs(
						Math.min(...stub.map((p) => p.y)) -
							Math.min(...inwardStub.map((p) => p.y)),
					) < epsilon,
					`${name}: hook does not reach the inward-serif depth`,
				);
			}
		}

		const [two] = glyphStore
			.queryByNameEnsured("two.lnum.curlyNeckCornerHookSerifless")
			.geometry.toContours();
		const innerCorner = two[two.length - 3];
		const arcStart = two[two.length - 4];
		assert.ok(
			arcStart.x > innerCorner.x,
			"two: arc starts behind the inner corner",
		);
		assert.ok(
			Math.abs(arcStart.y - innerCorner.y) < epsilon,
			"two: inner corner folds below the horizontal stroke",
		);
	});
}
