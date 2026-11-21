import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geom from "@iosevka/geometry";
import { buildGlyphs } from "../../font-glyphs/lib/index.mjs";
import { getParametersT } from "../src/param/index.mjs";

await Geom.Init();
const makePara = await getParametersT({
	paramsDir: fileURLToPath(new URL("../../../params", import.meta.url)),
});

function rightEdge(glyph, y) {
	const xs = [];
	for (const contour of new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs()) {
		for (const arc of contour) {
			let a = glyph.gizmo.unapply(arc.eval(0));
			for (let i = 1; i <= 64; i++) {
				const b = glyph.gizmo.unapply(arc.eval(i / 64));
				if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
					xs.push(a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y));
				}
				a = b;
			}
		}
	}
	assert.ok(xs.length);
	return Math.max(...xs);
}

for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	for (const size of ["big", "small"]) {
		test(`${size} top bowls: ${slope} ${weight}`, () => {
			const name = size === "big" ? "big-top-bowl" : "big-bottom-bowl";
			const para = makePara({
				shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Bowl test", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: true, noLigation: true },
				variants: { design: { "capital-b": `${name}-serifless`, "lower-beta": name, "cyrl-ve": `${name}-tall`, "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Latin-Upper-B",
				glyphIsNeeded: () => true,
			});
			for (const name of ["B", "grek/beta", "latn/beta", "cyrl/ve", "cyrl/ve.BGR"]) {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length > 0, `${name} is empty`);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}
			const b = glyphStore.queryByNameEnsured("B");
			const strike = b.gizmo.unapply(b.baseAnchors.strike);
			assert.ok(size === "big" ? strike.y < para.cap * 0.5 : strike.y > para.cap * 0.5);
			const stem = size === "big" ? "bigTopBowl" : "smallTopBowl";
			const ref = glyphStore.queryByNameEnsured(`smcpB.${stem}Tall`);
			const xAtBowlExtremum = (glyph, bottom, top) => Math.max(
				...Array.from({ length: 31 }, (_, i) => rightEdge(glyph, bottom + (top - bottom) * (i + 1) / 32)),
			);
			const midpoint = ref.gizmo.unapply(ref.baseAnchors.strike).y;
			const upperEdge = xAtBowlExtremum(ref, midpoint + para.stroke * 0.5, para.ascender);
			const lowerEdge = xAtBowlExtremum(ref, 0, midpoint - para.stroke * 0.5);
			assert.ok(
				size === "big" ? upperEdge - lowerEdge > 20 : lowerEdge - upperEdge > 20,
				`${stem} does not have a narrower ${size === "big" ? "bottom" : "top"} bowl`,
			);
			const bUpper = xAtBowlExtremum(b, strike.y + para.stroke * 0.5, para.cap);
			const bLower = xAtBowlExtremum(b, 0, strike.y - para.stroke * 0.5);
			assert.ok(size === "big" ? bUpper - bLower > 20 : bLower - bUpper > 20, "B bowl widths are not asymmetric");
			if (size === "big") {
				const flipped = glyphStore.queryByNameEnsured("smcpB.smallTopBowlTall");
				const flippedMid = flipped.gizmo.unapply(flipped.baseAnchors.strike).y;
				const flippedUpper = xAtBowlExtremum(flipped, flippedMid + para.stroke * 0.5, para.ascender);
				const flippedLower = xAtBowlExtremum(flipped, 0, flippedMid - para.stroke * 0.5);
				assert.ok(Math.abs(upperEdge - flippedLower) < 3, "large bowl widths do not mirror");
				assert.ok(Math.abs(lowerEdge - flippedUpper) < 3, "small bowl widths do not mirror");
			}
			for (const glyphName of [
				`grek/beta.${stem}`,
				`grek/beta.matrixDescendingClosed${size === "big" ? "BigTopBowl" : "BigBottomBowl"}`,
				`grek/beta.matrixCursiveClosed${size === "big" ? "BigTopBowl" : "BigBottomBowl"}`,
				`smcpB.${stem}BGRTall`,
				...["EarlessRounded", "EarlessCorner", "FlatTop", "FlatTopSerifed"].map(
					ear => `smcpB.matrix${ear}FlatBottomClosed${size === "big" ? "BigTopBowl" : "BigBottomBowl"}Tall`,
				),
				...["Rounded", "Corner"].map(
					tooth => `smcpB.matrixEarlessRounded${tooth}Closed${size === "big" ? "BigTopBowl" : "BigBottomBowl"}Tall`,
				),
			]) {
				const glyph = glyphStore.queryByNameEnsured(glyphName);
				for (const fraction of [0.25, 0.30, 0.70, 0.75, 0.85]) {
					const y = para.ascender * fraction;
					const difference = Math.abs(rightEdge(glyph, y) - rightEdge(ref, y));
					const tolerance = fraction === 0.70 || fraction === 0.75 ? 2 : 12;
					assert.ok(difference < tolerance, `${glyphName} differs from B at ${fraction}: ${difference}`);
				}
			}
			for (const suffix of ["", "Tall", "BGRTall"]) {
				const ve = glyphStore.queryByNameEnsured(`smcpB.${stem}${suffix}`);
				const points = new Geom.SimplifyGeometry(ve.geometry, ve.gizmo, true).toContours()
					.flat().map(p => ve.gizmo.unapply(p));
				const top = Math.max(...points.map(p => p.y));
				let expected = suffix ? para.ascender : para.xHeight;
				if (suffix === "BGRTall") {
					const reference = glyphStore.queryByNameEnsured("smcpB.roundedTopTall");
					const referencePoints = new Geom.SimplifyGeometry(reference.geometry, reference.gizmo, true)
						.toContours().flat().map(p => reference.gizmo.unapply(p));
					expected = Math.max(...referencePoints.map(p => p.y));
				}
				assert.ok(Math.abs(top - expected) < 3, `${stem}${suffix} has the wrong height`);
			}
		});
	}
}
