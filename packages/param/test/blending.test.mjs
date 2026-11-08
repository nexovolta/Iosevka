import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { apply, init } from "../src/index.mjs";

test("blending adds and multiplies without modifying the source", () => {
	const source = {
		width: {
			multiplies: { blend: { 100: { stroke: 0.5 }, 200: { stroke: 1 } } },
			adds: { blend: { 100: { stroke: 10 }, 200: { stroke: 20 } } },
		},
	};
	const original = JSON.parse(JSON.stringify(source));
	for (const width of [100, 200, 150, 100]) {
		const sink = { stroke: 100 };
		apply(sink, source, ["width"], { width });
		assert.equal(sink.stroke, width * 0.6);
		assert.deepEqual(source, original);
	}
});

test("repeated font initialization is independent of preceding widths", () => {
	const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
	const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
	const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
	const original = JSON.parse(JSON.stringify(data));
	const argv = width => ({
		shape: { serifs: "sans", spacing: "quasi-proportional", weight: 920, width, slope: "italic", slopeAngle: 9.4 },
		featureControl: { noCvSs: true },
	});
	const expected = init(data, argv(350));
	init(data, argv(500));
	assert.deepEqual(init(data, argv(350)), expected);
	assert.deepEqual(data, original);
});
