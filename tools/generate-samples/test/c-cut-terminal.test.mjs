import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geom from "@iosevka/geometry";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));

function upperTerminal(glyph, side = 1) {
	const arcs = glyph.geometry.toBezArcs().flat();
	const top = Math.max(...arcs.flatMap(arc => [arc.a.y, arc.d.y]));
	const candidates = arcs.filter(arc => {
		const dx = arc.d.x - arc.a.x;
		const dy = arc.d.y - arc.a.y;
		const cross = point => (point.x - arc.a.x) * dy - (point.y - arc.a.y) * dx;
		return (
			(side > 0
				? Math.min(arc.a.x, arc.d.x) > glyph.advanceWidth * 0.6
				: Math.max(arc.a.x, arc.d.x) < glyph.advanceWidth * 0.4) &&
			Math.min(arc.a.y, arc.d.y) > top * 0.7 &&
			Math.abs(dy) > 2 &&
			Math.abs(cross(arc.b)) < 0.01 &&
			Math.abs(cross(arc.c)) < 0.01
		);
	});
	assert.equal(candidates.length, 1, `${glyph.identifier}: upper terminal`);
	return candidates[0];
}

for (const [weight, slope, capital, lower] of [
	[120, "upright", "vertical-cut", "diagonal-cut"],
	[420, "upright", "vertical-cut", "diagonal-cut"],
	[920, "upright", "diagonal-cut", "vertical-cut"],
	[420, "italic", "top-diagonal-cut-bottom-rounded", "top-rounded-bottom-vertical-cut"],
	[920, "italic", "diagonal-cut", "vertical-cut"],
]) {
	test(`C cut terminals ${weight} ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight },
			featureControl: { noCvSs: true },
			variants: {
				design: {
					"capital-c": capital,
					c: lower,
					"cyrl-capital-koppa": "vertical-cut-serifless",
					"cyrl-koppa": "diagonal-cut-base-serifed",
					"cyrl-capital-e": "vertical-cut",
					"cyrl-e": "diagonal-crossbar-rising-diagonal-cut",
				},
			},
		});
		const names = [
			"topRoundedBottomRounded",
			"topVerticalCutBottomVerticalCut",
			"topDiagonalCutBottomDiagonalCut",
			"topDiagonalCutBottomRounded",
			"topRoundedBottomVerticalCut",
		];
		for (const family of ["C", "c", "revC", "revc", "OOpen", "oOpen"]) {
			const paths = names.map(name => glyphPath(glyphStore.queryByNameEnsured(`${family}.${name}`)));
			assert.ok(paths.every(Boolean), family);
			assert.notEqual(paths[0], paths[1], `${family}: vertical cut`);
			assert.notEqual(paths[0], paths[2], `${family}: diagonal cut`);
			assert.notEqual(paths[1], paths[2], `${family}: distinct cuts`);
			for (const name of names) {
				const glyph = glyphStore.queryByNameEnsured(`${family}.${name}`);
				const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.equal(contours.length, 1, `${family}.${name}: contour count`);
				assert.ok(contours[0].every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
			}
		}
		for (const family of ["TInsular", "tInsular", "TInsular.phonotypic"]) {
			const name = suffix => family === "TInsular.phonotypic"
				? `${family}.${suffix}.serifless`
				: `${family}.${suffix}`;
			const paths = ["Rounded", "VerticalCut", "DiagonalCut"].map(style => {
				const glyph = glyphStore.queryByNameEnsured(name(`topRoundedBottom${style}`));
				const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length, glyph.identifier);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
				return glyphPath(glyph);
			});
			assert.notEqual(paths[0], paths[1], `${family}: vertical bottom cut`);
			assert.notEqual(paths[0], paths[2], `${family}: diagonal bottom cut`);
			assert.notEqual(paths[1], paths[2], `${family}: distinct bottom cuts`);
		}
		const insularSuffixes = {
			"vertical-cut": "topVerticalCutBottomVerticalCut",
			"diagonal-cut": "topDiagonalCutBottomDiagonalCut",
			"top-diagonal-cut-bottom-rounded": "topDiagonalCutBottomRounded",
			"top-rounded-bottom-vertical-cut": "topRoundedBottomVerticalCut",
		};
		for (const [cp, family, selection] of [[0xa786, "TInsular", capital], [0xa787, "tInsular", lower]]) {
			assert.equal(
				glyphPath(glyphStore.queryByUnicodeEnsured(cp)),
				glyphPath(glyphStore.queryByNameEnsured(`${family}.${insularSuffixes[selection]}`)),
				`${family}: selected C variant`,
			);
		}
		let curlyContourCount;
		const curlyPaths = [
			"topRoundedBottomRounded",
			"topVerticalCutBottomRounded",
			"topDiagonalCutBottomRounded",
		].map(suffix => {
			const name = `cCurlyTail.${suffix}`;
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			curlyContourCount ??= contours.length;
			assert.ok(curlyContourCount > 0, `${name}: empty geometry`);
			assert.equal(contours.length, curlyContourCount, `${name}: contour count`);
			return glyphPath(glyph);
		});
		assert.notEqual(curlyPaths[0], curlyPaths[1], "curly-tail vertical cut");
		assert.notEqual(curlyPaths[0], curlyPaths[2], "curly-tail diagonal cut");
		if (slope === "upright") {
			for (const [family, side] of [["C", 1], ["c", 1], ["revC", -1], ["revc", -1]]) {
				const vertical = upperTerminal(glyphStore.queryByNameEnsured(`${family}.${names[1]}`), side);
				const glyph = glyphStore.queryByNameEnsured(`${family}.${names[2]}`);
				const diagonal = upperTerminal(glyph, side);
				assert.ok(Math.abs(vertical.d.x - vertical.a.x) < 0.01, `${family}: vertical edge`);
				assert.ok(Math.abs(diagonal.d.x - diagonal.a.x) > 2, `${family}: diagonal edge`);
				const reachGap = side * (vertical.a.x - (diagonal.a.x + diagonal.d.x) / 2) / glyph.advanceWidth;
				assert.ok(Math.abs(reachGap - 0.015) < 0.01, `${family}: weight-independent reach: ${reachGap}`);
				if (family === "C") {
					const delta = upperTerminal(glyphStore.queryByNameEnsured("grek/delta.rounded"));
					assert.ok(
						Math.max(diagonal.a.x, diagonal.d.x) > Math.max(delta.a.x, delta.d.x),
						"delta-style terminal extends farther outward",
					);
				}
			}
		}
		for (const [cut, rounded] of [
			["topVerticalCutBottomDiagonalCut", "topRoundedBottomRounded"],
			["topSerifedBottomVerticalCut", "topSerifedBottomRounded"],
			["topDiagonalCutBottomCornerHook", "topRoundedBottomCornerHook"],
		]) {
			assert.equal(
				glyphPath(glyphStore.queryByNameEnsured(`oOpen/descBase.${cut}`)),
				glyphPath(glyphStore.queryByNameEnsured(`oOpen/descBase.${rounded}`)),
				`retroflex base ${cut}`,
			);
		}
		for (const [codepoint, selected, regular] of [
			[0x480, "cyrl/Koppa.verticalCut", "cyrl/Koppa.serifless"],
			[0x481, "cyrl/koppa.diagonalCutBaseSerifed", "cyrl/koppa.baseSerifed"],
		]) {
			const path = glyphPath(glyphStore.queryByNameEnsured(selected));
			assert.ok(path, selected);
			assert.notEqual(path, glyphPath(glyphStore.queryByNameEnsured(regular)), selected);
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(codepoint)), path, selected);
		}
		for (const [codepoint, family, suffix] of [
			[0x42d, "cyrl/E", "topVerticalCutBottomVerticalCut"],
			[0x404, "cyrl/YeUkrainian", "topVerticalCutBottomVerticalCut"],
			[0x44d, "cyrl/e", "topDiagonalCutBottomDiagonalCutDiagonalCrossbar"],
			[0x454, "cyrl/yeUkrainian", "topDiagonalCutBottomDiagonalCutDiagonalCrossbar"],
		]) {
			assert.equal(
				glyphPath(glyphStore.queryByUnicodeEnsured(codepoint)),
				glyphPath(glyphStore.queryByNameEnsured(`${family}.${suffix}`)),
				`${family}.${suffix}`,
			);
		}
		const capitalSuffix = capital === "vertical-cut" ? names[1] : capital === "diagonal-cut" ? names[2] : names[3];
		const lowerSuffix = lower === "vertical-cut" ? names[1] : lower === "diagonal-cut" ? names[2] : names[4];
		const romanSuffix = capital === "vertical-cut" ? "topVerticalCutBottomRounded" : "topDiagonalCutBottomRounded";
		assert.equal(
			glyphPath(glyphStore.queryByUnicodeEnsured(0x2185)),
			glyphPath(glyphStore.queryByNameEnsured(`romanSixLateForm.${romanSuffix}`)),
			"late Roman six follows the top cut",
		);
		assert.equal(
			glyphPath(glyphStore.queryByUnicodeEnsured(0x187)),
			glyphPath(glyphStore.queryByNameEnsured("CHookTop.topRoundedBottomRounded")),
			"implosive hook stays unchanged",
		);
		for (const [codepoint, family, suffix] of [
			[0x43, "C", capitalSuffix],
			[0x63, "c", lowerSuffix],
			[0x2183, "revC", capitalSuffix],
			[0x2184, "revc", lowerSuffix],
			[0x186, "OOpen", capitalSuffix],
			[0x254, "oOpen", lowerSuffix],
		]) {
			assert.equal(
				glyphPath(glyphStore.queryByUnicodeEnsured(codepoint)),
				glyphPath(glyphStore.queryByNameEnsured(`${family}.${suffix}`)),
				`${codepoint.toString(16)}: ${suffix}`,
			);
		}
	});
}
