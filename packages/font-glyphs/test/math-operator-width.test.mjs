import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import { init } from "@iosevka/param";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(name =>
		Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8")),
	),
);

function metricsFor(spacing, width, slopeAngle = 0) {
	const para = init(data, {
		shape: {
			serifs: "sans",
			spacing,
			weight: 420,
			width,
			slopeAngle,
			slope: slopeAngle ? "italic" : "upright",
		},
		featureControl: {},
	});
	return { para, metrics: calculateMetrics(para) };
}

for (const spacing of ["quasi-proportional", "quasi-proportional-extension-only"]) {
	for (const width of [500, 600]) {
		test(`${spacing} uses MM width for wide math operators at ${width}`, () => {
			const { para, metrics } = metricsFor(spacing, width);
			assert.equal(
				metrics.MathOperatorWidth(metrics.WideWidth0, true),
				metrics.Width * para.advanceScaleMM,
			);
			assert.equal(metrics.MathOperatorWidth(metrics.Width, false), metrics.Width);
			assert.equal(metrics.WideWidth0, 1000);
		});
	}
}

test("monospace math widths keep their existing narrow and wide advances", () => {
	const { metrics } = metricsFor("term", 500);
	assert.equal(metrics.MathOperatorWidth(metrics.Width, false), metrics.Width);
	assert.equal(metrics.MathOperatorWidth(metrics.WideWidth0, true), metrics.WideWidth0);
	assert.equal(metrics.WideWidth0, 2 * metrics.Width);
});

test("horizontal math scaling preserves the italic shear", () => {
	const { metrics } = metricsFor("quasi-proportional", 600, 9.4);
	const { TanSlope, SymbolMid, ApparentScaleX } = metrics;
	const x = 200;
	const y = 300;
	const scale = 0.9;
	const shear = TanSlope * (y - SymbolMid);
	const transformed = ApparentScaleX(scale).applyXY(x + shear, y);
	assert.notEqual(TanSlope, 0);
	assert.ok(Math.abs(transformed.x - (scale * x + shear)) < 1e-9);
	assert.equal(transformed.y, y);
});
