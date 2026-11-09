import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { CreateWeightControl } from "@iosevka/font-kits/weight-control";
import * as Geom from "@iosevka/geometry";
import { Transform } from "@iosevka/geometry/transform";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";
import * as TypoGeom from "typo-geom";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");
const newKeys = ["hooky-crossing", "hooky", "vertical", "open-straight-tailed", "closed-straight-tailed"];

await Geom.Init();

function area(geometry) {
	return geometry.toBezArcs().reduce((sum, contour) => {
		const points = contour.flatMap(arc => Array.from({ length: 8 }, (_, i) => arc.eval(i / 8)));
		return sum + Math.abs(points.reduce((total, p, i) => {
			const next = points[(i + 1) % points.length];
			return total + p.x * next.y - next.x * p.y;
		}, 0)) / 2;
	}, 0);
}

function rectangle(left, right, bottom, top) {
	return new Geom.ContourSetGeometry([[
		{ type: 0, x: left, y: bottom },
		{ type: 0, x: left, y: top },
		{ type: 0, x: right, y: top },
		{ type: 0, x: right, y: bottom },
	]]);
}

for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`capital Q and U+1DF7A tails at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-q": "hooky", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const byName = name => glyphStore.queryByNameEnsured(name);
		const contours = glyph => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const qPrime = para.variants.primes.get("capital-q");
		const uPrime = para.variants.primes.get("capital-u");
		const q = glyphStore.queryByUnicode(0x51);
		const u = glyphStore.queryByUnicode(0x1df7a);
		const uBody = glyphStore.queryByUnicode(0x55);
		const two = glyphStore.queryByUnicode(0x32);
		assert.ok(q && u && uBody);
		const upperMask = rectangle(-10000, 10000, para.cap * 0.8, 10000);
		const lowerMask = rectangle(-10000, 10000, -10000, para.cap / 2 - para.stroke);

		const angle = para.slopeAngle * Math.PI / 180;
		const contrast = (para.contrast ?? 1) * Math.cos(angle) + Math.sin(angle) * Math.tan(angle);
		const width = Math.round(para.width);
		const sb = Math.round(para.sb);
		const { AdviceStroke } = CreateWeightControl(para, { Width: width, SB: sb, HVContrast: contrast });
		const stroke = AdviceStroke(2);
		const stemSlice = rectangle(-10000, width / 2, para.cap * 0.85, para.cap * 0.85 + 1);
		const sliceBounds = (glyph, mask) => {
			const slice = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Intersection, [glyph.geometry, mask]);
			const points = slice.toBezArcs().flatMap(contour => contour.flatMap(arc =>
				Array.from({ length: 9 }, (_, i) => arc.eval(i / 8))));
			assert.ok(points.length, "missing stem slice");
			return [Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x))];
		};
		for (const variant of qPrime.variants.values()) {
			const suffix = variant.get(q).split(".").pop();
			const glyph = byName(`URTail.toothlessRoundedSerifless.${suffix}`);
			const [left, right] = sliceBounds(glyph, stemSlice);
			const actual = right - left;
			assert.ok(Math.abs(actual - stroke * contrast - Math.abs(Math.tan(angle))) < 0.5,
				`${suffix}: upper stem width ${actual}, expected ${stroke * contrast}`);
		}
		const seamY = para.cap / 2 + Math.max(6, stroke * 0.05);
		for (const suffix of ["curlyTailed", "horizontalTailed", "openSwash", "openStraightTailed"]) {
			const selectedQ = byName(`Q.${suffix}`);
			const selectedU = byName(`URTail.toothlessRoundedSerifless.${suffix}`);
			for (const [left, right] of [[-10000, width / 2], [width / 2, 10000]]) {
				const slice = rectangle(left, right, seamY, seamY + 1);
				const qBounds = sliceBounds(selectedQ, slice);
				const uBounds = sliceBounds(selectedU, slice);
				assert.ok(qBounds.every((x, i) => Math.abs(x - uBounds[i]) < 0.5),
					`${suffix}: U stem does not align with Q contour`);
			}
		}

		for (const variant of qPrime.variants.values()) {
			const suffix = variant.get(q).split(".").pop();
			const sourceQ = byName(`smcpQ.${suffix}`);
			const sidewaysQ = byName(`QSideways.${suffix}`);
			const sidewaysTransform = Transform.Combine(
				sourceQ.gizmo.inverse(),
				Transform.Scale(Math.round(para.xHeight) / width, (width - sb) / Math.round(para.xHeight)),
				Transform.Translate(0, sb / 2),
				new Transform(0, -1, 1, 0, width, 0),
				sidewaysQ.gizmo,
			);
			const expectedSideways = Geom.TransformedGeometry.create(sidewaysTransform, sourceQ.geometry);
			const sidewaysDifference = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Xor,
				[sidewaysQ.geometry, expectedSideways]);
			assert.ok(area(sidewaysDifference) < 1, `${suffix}: sideways Q must use the unskewed small-cap Q`);
		}

		const innerStroke = Math.min(AdviceStroke(4), AdviceStroke(3.5),
			0.5 * (width - 2 * sb - 2 * stroke * contrast) / contrast);
		const descender = Math.round(para.descender ?? (para.xHeight - para.ascender));
		const innerTop = descender + 1.75 * (stroke / 2 - descender);
		const innerSlice = rectangle(-10000, 10000, innerTop - 2, innerTop - 1);
		for (const [crossing, plain] of [
			["crossingCurlyTailed", "curlyTailed"],
			["verticalCrossing", "vertical"],
			["hookyCrossing", "hooky"],
		]) {
			for (const prefix of ["Q", "URTail.toothlessRoundedSerifless"]) {
				const crossingGlyph = byName(`${prefix}.${crossing}`);
				const plainGlyph = byName(`${prefix}.${plain}`);
				const innerOnly = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Difference,
					[crossingGlyph.geometry, plainGlyph.geometry]);
				const [left, right] = sliceBounds({ geometry: innerOnly }, innerSlice);
				const expected = innerStroke * contrast + Math.abs(Math.tan(angle));
				assert.ok(Math.abs(right - left - expected) < 0.5,
					`${prefix}.${crossing}: inner width ${right - left}, expected ${expected}`);
				if (crossing !== "crossingCurlyTailed") {
					const exteriorMask = rectangle(-10000, 10000, -10000, -1);
					const differentExterior = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Intersection, [
						new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Xor, [
							crossingGlyph.geometry, plainGlyph.geometry,
						]),
						exteriorMask,
					]);
					assert.ok(area(differentExterior) < 1, `${prefix}.${crossing}: exterior differs from standard tail`);
				}
			}
		}

		for (const prefix of ["Q", "smcpQ", "URTail.toothlessRoundedSerifless"]) {
			const closed = byName(`${prefix}.closedStraightTailed`);
			const standard = byName(`${prefix}.straight`);
			const upperTail = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Intersection, [
				new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Difference, [
					closed.geometry, standard.geometry,
				]),
				rectangle(-10000, 10000, stroke + 2, 10000),
			]);
			assert.ok(area(upperTail) < 1, `${prefix}: closed straight tail protrudes beyond the bowl`);
		}

		for (const variant of para.variants.primes.get("two").variants.values()) {
			const name = variant.get(two);
			assert.ok(name, `2: missing ${variant.key}`);
			const shape = contours(byName(name));
			assert.ok(shape.length && shape.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		}

		for (const [label, glyph] of [["Q", q], ["small Q", glyphStore.queryByUnicode(0xa7af)], ["sideways Q", glyphStore.queryByUnicode(0x213a)], ["U+1DF7A", u]]) {
			const seen = new Set();
			for (const variant of qPrime.variants.values()) {
				const name = variant.get(glyph);
				assert.ok(name, `${label}: missing ${variant.key}`);
				const shape = contours(byName(name));
				assert.ok(shape.length && shape.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			for (const key of newKeys) {
				const name = qPrime.variants.get(key).get(glyph);
				assert.ok(name, `${label}: missing ${key}`);
				const shape = contours(byName(name));
				assert.ok(shape.length && shape.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				const exteriors = shape.filter(c => c.reduce((sum, p, i) => {
					const next = c[(i + 1) % c.length];
					return sum + p.x * next.y - next.x * p.y;
				}, 0) < 0);
				const expectedExteriors = label === "U+1DF7A" && key === "open-straight-tailed" ? 2 : 1;
				assert.equal(exteriors.length, expectedExteriors, `${name}: detached contour ${JSON.stringify(exteriors.map(c => [
					Math.min(...c.map(p => p.x)), Math.max(...c.map(p => p.x)),
					Math.min(...c.map(p => p.y)), Math.max(...c.map(p => p.y)),
				]))}`);
				if (label === "Q" && key === "open-straight-tailed") assert.equal(shape.length, 1, `${name}: counter must be open`);
				if (label === "Q" && key === "closed-straight-tailed") assert.ok(shape.length >= 2, `${name}: counter must be closed`);
				seen.add(JSON.stringify(shape));
			}
			assert.equal(seen.size, newKeys.length, `${label}: variants must differ`);
		}

		const uVariants = [...uPrime.variants.values()].filter(v => v.get(uBody));
		assert.ok(uVariants.length > 5);
		for (const uVariant of uVariants) {
			assert.ok(uVariant.get(u), `${uVariant.key}: missing U+1DF7A variant`);
			const selectedU = byName(uVariant.get(u));
			const bodyName = uVariant.get(uBody);
			let roundedBodyName = bodyName.replace(/^U\.(toothed|tailed)(BottomCut)?/, "U.toothlessRounded");
			roundedBodyName = roundedBodyName.replace(/BottomRightSerifed$/, "Serifless");
			const selectedBody = byName(roundedBodyName);
			const centerAt = y => width / 2 + Math.tan(angle) * (y - Math.round(para.symbolMid));
			const splitY = para.cap * 0.8;
			const leftHalf = new Geom.ContourSetGeometry([[
				{ type: 0, x: -10000, y: splitY },
				{ type: 0, x: -10000, y: 10000 },
				{ type: 0, x: centerAt(10000), y: 10000 },
				{ type: 0, x: centerAt(splitY), y: splitY },
			]]);
			const rightHalf = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Difference, [upperMask, leftHalf]);
			const expectedTop = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Union, [
				Geom.TransformedGeometry.create(Transform.Translate(para.overshootx, 0),
					new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Intersection, [selectedBody.geometry, leftHalf])),
				Geom.TransformedGeometry.create(Transform.Translate(-para.overshootx, 0),
					new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Intersection, [selectedBody.geometry, rightHalf])),
			]);
			for (const qVariant of qPrime.variants.values()) {
				const name = qVariant.get(selectedU);
				assert.ok(name, `${uVariant.key} × ${qVariant.key}`);
				const glyph = byName(name);
				const shape = contours(glyph);
				assert.ok(shape.length && shape.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				assert.equal(glyph.advanceWidth, selectedBody.advanceWidth, name);
				const exteriors = shape.filter(c => c.reduce((sum, p, i) => {
					const next = c[(i + 1) % c.length];
					return sum + p.x * next.y - next.x * p.y;
				}, 0) < 0);
				const expectedExteriors = ["open-swash", "open-straight-tailed", "detached-tailed", "detached-bend-tailed"].includes(qVariant.key) ? 2 : 1;
				assert.equal(exteriors.length, expectedExteriors, `${name}: detached from U body`);
				const actualTop = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Intersection, [glyph.geometry, upperMask]);
				const topDifference = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Xor, [expectedTop, actualTop]);
				assert.ok(area(topDifference) < 1, `${name}: U stems or serifs are misaligned (${area(topDifference)})`);
				if (!qVariant.key.includes("crossing")) {
					const selectedQ = byName(qVariant.get(q));
					const lowerQ = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Intersection, [selectedQ.geometry, lowerMask]);
					const missingLower = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Difference, [lowerQ, glyph.geometry]);
					assert.ok(area(missingLower) < 1, `${name}: lower Q body or tail was lost`);
				}
				const qFirst = byName(qVariant.get(u));
				assert.equal(uVariant.get(qFirst), name, `${uVariant.key} × ${qVariant.key}: selector order`);
			}
		}
	});
}
