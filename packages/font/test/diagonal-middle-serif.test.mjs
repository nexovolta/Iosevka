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

const blocks = [
	"Letter-Latin-Upper-E", "Letter-Latin-Upper-F", "Letter-Latin-Upper-H",
	"Letter-Latin-C", "Letter-Latin-Upper-AE-OE", "Letter-Greek-Upper-Xi",
	"Letter-Greek-Upper-Gamma", "Letter-Cyrillic-Iotated",
];
const names = [];
for (const direction of ["DiagonalCrossbar", "DiagonalCrossbarFalling"]) {
	const ef = direction[0].toLowerCase() + direction.slice(1);
	for (const glyph of ["E", "revE", "smcpE", "F", "smcpF", "AE/E", "OE/E", "smcpAE/smcpE", "smcpOE/smcpE"]) {
		names.push(`${glyph}.${ef}Capped`);
		names.push(`${glyph}.${ef}SerifedCapped`);
	}
	for (const glyph of ["HLeftHalf", "HRightHalf", "smcpHLeftHalf", "smcpHRightHalf"]) {
		names.push(`${glyph}.serifed${direction}`);
	}
	names.push(`grek/Xi.${ef}MiddleSerifed`, `grek/Digamma.${ef}Capped`);
	for (const glyph of ["cyrl/E", "cyrl/e", "cyrl/YeUkrainian", "cyrl/yeUkrainian", "cyrl/EIotated", "cyrl/eIotated"])
		for (const hook of ["serifless", "flatHook", "cornerHook", "bilateralSerifed"])
			names.push(`${glyph}.${hook}Capped${direction}`);
}

function lineSegments(glyph) {
	return new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs().flat().map(arc => ({
		a: glyph.gizmo.unapply(arc.eval(0)),
		b: glyph.gizmo.unapply(arc.eval(1)),
		m: glyph.gizmo.unapply(arc.eval(0.5)),
	}));
}

function isHorizontal({ a, b, m }) {
	return Math.abs(b.x - a.x) > 1 && Math.abs(b.y - a.y) < 0.01 && Math.abs(m.y - a.y) < 0.01;
}

for (const spacing of ["normal", "term"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`diagonal middle serifs have no flat bar joins: ${spacing} ${slope} ${weight}`, () => {
		const para = makePara({
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Middle serif test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => blocks.includes(id),
			glyphIsNeeded: id => names.includes(id) || id === "F.capped" || id === "grek/Digamma.capped",
		});
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
			assert.ok(contours.length, name);
			const top = name.startsWith("smcp") || /^cyrl\/[a-z]/.test(name) ? para.xHeight : para.cap;
			for (const contour of contours) for (let i = 0; i < contour.length; i++) {
				const arc = contour[i];
				const a = glyph.gizmo.unapply(arc.eval(0));
				const b = glyph.gizmo.unapply(arc.eval(1));
				const m = glyph.gizmo.unapply(arc.eval(0.5));
				if (Math.abs(b.x - a.x) < 1 || Math.abs(b.y - a.y) > 0.01 || Math.abs(m.y - a.y) > 0.01) continue;
				if (a.y < top * 0.25 || a.y > top * 0.75) continue;
				for (const neighbor of [contour[(i + contour.length - 1) % contour.length], contour[(i + 1) % contour.length]]) {
					const c = glyph.gizmo.unapply(neighbor.eval(0));
					const d = glyph.gizmo.unapply(neighbor.eval(1));
					const dx = Math.abs(d.x - c.x);
					const dy = Math.abs(d.y - c.y);
					assert.ok(!(dx > 1 && dy > 0.05 && dy / dx < 0.8), `${name}: horizontal join at ${a.y}`);
				}
			}
		}

		const middle = segment => segment.a.y > para.cap * 0.25 && segment.a.y < para.cap * 0.75;
		const straight = lineSegments(glyphStore.queryByNameEnsured("F.capped")).filter(segment => isHorizontal(segment) && middle(segment));
		assert.equal(straight.length, 4);
		const outerX = Math.max(...straight.flatMap(segment => [segment.a.x, segment.b.x]));
		const tips = straight.filter(segment => Math.abs(Math.max(segment.a.x, segment.b.x) - outerX) < 0.05);
		const bars = straight.filter(segment => !tips.includes(segment));
		assert.equal(tips.length, 2);
		const serifWidth = Math.abs(tips[0].b.x - tips[0].a.x);
		const length = Math.abs(tips[0].a.y - tips[1].a.y) / 2;
		const stroke = Math.abs(bars[0].a.y - bars[1].a.y);
		const innerX = Math.min(tips[0].a.x, tips[0].b.x);
		for (const direction of ["diagonalCrossbar", "diagonalCrossbarFalling"]) {
			const segments = lineSegments(glyphStore.queryByNameEnsured(`F.${direction}Capped`));
			const tip = segments.find(segment => isHorizontal(segment) && middle(segment)
				&& Math.abs(Math.min(segment.a.x, segment.b.x) - innerX) < 0.05
				&& Math.abs(Math.max(segment.a.x, segment.b.x) - outerX) < 0.05);
			assert.ok(tip, direction);
			const leg = segments.find(segment => Math.abs(segment.a.x - innerX) < 0.05 && Math.abs(segment.b.x - innerX) < 0.05
				&& Math.abs(segment.a.y - segment.b.y) > 1
				&& (Math.abs(segment.a.y - tip.a.y) < 0.05 || Math.abs(segment.b.y - tip.a.y) < 0.05));
			assert.ok(leg, direction);
			const bar = segments.find(segment => Math.abs(segment.b.x - segment.a.x) > serifWidth * 1.2
				&& Math.abs(segment.b.y - segment.a.y) > 1 && middle(segment));
			assert.ok(bar, direction);
			const barSlope = (bar.b.y - bar.a.y) / (bar.b.x - bar.a.x);
			const halfHeight = stroke * Math.hypot(1, barSlope) / 2;
			const oldShift = Math.max(0, length - halfHeight + 1 / 128);
			const oldProjection = length + oldShift - halfHeight + Math.abs(barSlope) * serifWidth;
			const projection = Math.abs(leg.a.y - leg.b.y);
			assert.ok(Math.abs(projection - oldProjection / 2) < 0.1, `${direction}: ${projection} vs ${oldProjection / 2}`);
		}

		const gammaStraight = lineSegments(glyphStore.queryByNameEnsured("grek/Digamma.capped"))
			.filter(segment => isHorizontal(segment) && middle(segment));
		const levels = [...new Set(gammaStraight.map(segment => Math.round(segment.a.y * 100) / 100))].sort((a, b) => a - b);
		assert.equal(levels.length, 3);
		const gammaTip = gammaStraight.find(segment => Math.abs(segment.a.y - levels[0]) < 0.05);
		assert.ok(gammaTip);
		const gammaWidth = Math.abs(gammaTip.b.x - gammaTip.a.x);
		const gammaOuterX = Math.max(gammaTip.a.x, gammaTip.b.x);
		const gammaLength = levels[2] - levels[0];
		const gammaHalfStroke = (levels[2] - levels[1]) / 2;
		for (const direction of ["diagonalCrossbar", "diagonalCrossbarFalling"]) {
			const segments = lineSegments(glyphStore.queryByNameEnsured(`grek/Digamma.${direction}Capped`));
			const tip = segments.find(segment => isHorizontal(segment) && middle(segment)
				&& Math.abs(Math.max(segment.a.x, segment.b.x) - gammaOuterX) < 0.05);
			assert.ok(tip, direction);
			const diagonals = segments.filter(segment => Math.abs(segment.b.x - segment.a.x) > 10
				&& Math.abs(segment.b.y - segment.a.y) > 1 && middle(segment));
			assert.equal(diagonals.length, 2, direction);
			const barSlope = (diagonals[0].b.y - diagonals[0].a.y) / (diagonals[0].b.x - diagonals[0].a.x);
			const halfHeight = gammaHalfStroke * Math.hypot(1, barSlope);
			const shift = Math.max(0, barSlope * gammaWidth + gammaHalfStroke - halfHeight + 1 / 128);
			const oldProjection = gammaLength - gammaHalfStroke + shift - halfHeight + Math.max(0, -barSlope * gammaWidth);
			const x = barSlope < 0 ? Math.min(tip.a.x, tip.b.x) : gammaOuterX;
			const lowerBar = Math.min(...diagonals.map(segment => segment.a.y + barSlope * (x - segment.a.x)));
			const projection = lowerBar - tip.a.y;
			assert.ok(Math.abs(projection - oldProjection / 2) < 0.1, `${direction} digamma: ${projection} vs ${oldProjection / 2}`);
		}
	});
}
