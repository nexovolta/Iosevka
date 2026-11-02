import assert from "node:assert/strict";
import test from "node:test";

import { Point } from "../src/point.mjs";
import { QuadifySink } from "../src/quadify.mjs";

test("rounded contours do not retain coincident consecutive corners", () => {
	const sink = new QuadifySink();
	sink.lastContour = [
		Point.corner(0, 0),
		new Point(Point.Type.Quadratic, 0, 2),
		new Point(Point.Type.Quadratic, 1, 2),
		Point.corner(1, 2),
		new Point(Point.Type.Quadratic, 2, 1),
		new Point(Point.Type.Quadratic, 2, 1),
		Point.corner(20, 0),
		Point.corner(20, 20),
		Point.corner(0, 20),
	];
	sink.endShape();

	assert.equal(sink.contours.length, 1);
	const contour = sink.contours[0];
	assert.equal(contour.length, 8);
	for (let i = 0; i < contour.length; i++) {
		const a = contour[i];
		const b = contour[(i + 1) % contour.length];
		assert.ok(
			a.type !== Point.Type.Corner ||
				b.type !== Point.Type.Corner ||
				a.x !== b.x ||
				a.y !== b.y,
		);
	}
});
