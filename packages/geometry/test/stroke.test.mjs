import assert from "node:assert/strict";
import test from "node:test";
import * as TypoGeom from "typo-geom";

import { strokeArcs } from "../src/stroke.mjs";

test("mitered strokes preserve sharp corners without changing the default rounded join", async () => {
	await TypoGeom.Init();
	const points = [
		{ x: 0, y: 0 },
		{ x: 100, y: 0 },
		{ x: 100, y: 100 },
		{ x: 0, y: 100 },
	];
	const square = points.map((p, i) =>
		new TypoGeom.Arcs.StraightSegment(p, points[(i + 1) % points.length]),
	);
	const corners = shape =>
		shape.flatMap(contour =>
			contour.flatMap(arc => Array.from({ length: 41 }, (_, i) => arc.eval(i / 40))),
		);
	const miter = corners(strokeArcs([square], 10, 1, false, true));
	const round = corners(strokeArcs([square], 10, 1, false));
	assert.ok(miter.some(p => Math.hypot(p.x + 10, p.y + 10) < 0.1));
	assert.ok(round.every(p => Math.hypot(p.x + 10, p.y + 10) > 1));
});
