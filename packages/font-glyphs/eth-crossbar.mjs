import { BOOLE_RESOLUTION } from "@iosevka/geometry/curve-util";
import * as TypoGeom from "typo-geom";

function segmentsOf(glyph) {
	const contours = TypoGeom.Boolean.removeOverlap(
		glyph.geometry.toBezArcs(),
		TypoGeom.Boolean.PolyFillType.NonZero,
		BOOLE_RESOLUTION,
	);
	const segments = [];
	for (const contour of contours) {
		for (const arc of contour) {
			let a = arc.eval(0);
			for (let j = 1; j <= 12; j++) {
				const b = arc.eval(j / 12);
				segments.push([a, b]);
				a = b;
			}
		}
	}
	return segments;
}

function cross(a, b) {
	return a.x * b.y - a.y * b.x;
}

function intervals(segments, origin, direction) {
	const hits = [];
	for (const [a, b] of segments) {
		const edge = { x: b.x - a.x, y: b.y - a.y };
		const offset = { x: a.x - origin.x, y: a.y - origin.y };
		const denominator = cross(direction, edge);
		if (Math.abs(denominator) < 1e-9) continue;
		const u = cross(offset, direction) / denominator;
		if (u >= 0 && u < 1) hits.push(cross(offset, edge) / denominator);
	}
	hits.sort((a, b) => a - b);
	if (hits.length % 2 !== 0) throw new Error("Unclosed outline while placing eth crossbar");
	const result = [];
	for (let i = 0; i + 1 < hits.length; i += 2) {
		result.push([hits[i], hits[i + 1]]);
	}
	return result;
}

function stemAt(segments, y, nearX) {
	const spans = intervals(segments, { x: 0, y }, { x: 1, y: 0 });
	if (!spans.length) return null;
	let span = spans[spans.length - 1];
	if (nearX !== undefined) {
		span = spans.reduce((best, candidate) =>
			Math.abs((candidate[0] + candidate[1]) / 2 - nearX) <
			Math.abs((best[0] + best[1]) / 2 - nearX)
				? candidate
				: best,
		);
	}
	return (span[0] + span[1]) / 2;
}

export function ethCrossbar(glyph, ascender, width, thickness) {
	const segments = segmentsOf(glyph);
	const gap = Math.max(1, width * 0.01);
	const extension = width * 0.19;
	const minimumExtension = width * 0.035;
	const step = Math.max(2, thickness * 0.08);

	// Fit a perpendicular bar to the stem while leaving clearance from other contours.
	for (const fraction of [0.76, 0.72, 0.8, 0.68, 0.84, 0.64, 0.88, 0.92]) {
		const y = ascender * fraction;
		const x = stemAt(segments, y);
		if (x === null) continue;
		const below = stemAt(segments, y - step, x);
		const above = stemAt(segments, y + step, x);
		if (below === null || above === null) continue;
		const slope = (above - below) / (2 * step);
		const length = Math.hypot(1, slope);
		const normal = { x: 1 / length, y: -slope / length };
		const tangent = { x: slope / length, y: 1 / length };
		let leftStem = Infinity;
		let rightStem = -Infinity;
		let leftLimit = -Infinity;
		let rightLimit = Infinity;
		let valid = true;
		for (let i = 0; i <= 12; i++) {
			const offset = thickness * (i / 12 - 0.5);
			const origin = { x: x + tangent.x * offset, y: y + tangent.y * offset };
			const spans = intervals(segments, origin, normal);
			const index = spans.findIndex(([left, right]) => left <= 0 && right >= 0);
			if (index < 0) {
				valid = false;
				break;
			}
			leftStem = Math.min(leftStem, spans[index][0]);
			rightStem = Math.max(rightStem, spans[index][1]);
			if (index > 0) leftLimit = Math.max(leftLimit, spans[index - 1][1] + gap);
			if (index + 1 < spans.length)
				rightLimit = Math.min(rightLimit, spans[index + 1][0] - gap);
		}
		if (!valid) continue;
		const left = Math.max(leftLimit, leftStem - extension);
		const right = Math.min(rightLimit, rightStem + extension);
		if (leftStem - left < minimumExtension || right - rightStem < minimumExtension) continue;

		return [
			[left, -0.5],
			[right, -0.5],
			[right, 0.5],
			[left, 0.5],
		].map(([along, across]) =>
			glyph.gizmo.unapply({
				x: x + normal.x * along + tangent.x * thickness * across,
				y: y + normal.y * along + tangent.y * thickness * across,
			}),
		);
	}
	throw new Error(`Cannot place an isolated eth crossbar on ${glyph.identifier}`);
}
