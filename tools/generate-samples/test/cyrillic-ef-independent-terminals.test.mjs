import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("cyrl-ef");
for (const slope of ["upright", "italic"]) {
	test(`independent Cyrillic ef terminals: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "cyrl-ef": "top-diagonal-cut-bottom-vertical-cut" } },
		});
		const path = name => glyphPath(glyphStore.queryByNameEnsured(name));
		let count = 0;
		for (const [key, variant] of prime.variants) {
			if (!/(^|-)top-(straight|flat-hooked|rounded-tailed|diagonal-tailed|vertical-cut|diagonal-cut)-bottom-/.test(key)) continue;
			count++;
			const glyph = glyphStore.queryByNameEnsured(`cyrl/ef.${variant.selector["cyrl/ef"]}`);
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			assert.ok(contours.length, key);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), key);
			assert.ok(glyphStore.queryByNameEnsured(`cyrl/ef.${variant.selector["cyrl/ef.BGR"]}`), key);
		}
		assert.equal(count, 180);
		assert.equal(path("cyrl/ef.topFlatHookedBottomFlatHooked"), path("cyrl/ef.cursive"));
		const base = path("cyrl/ef.topStraightBottomStraight");
		for (const style of ["FlatHooked", "RoundedTailed", "DiagonalTailed", "VerticalCut", "DiagonalCut"]) {
			assert.notEqual(path(`cyrl/ef.top${style}BottomStraight`), base, `top ${style}`);
			assert.notEqual(path(`cyrl/ef.topStraightBottom${style}`), base, `bottom ${style}`);
		}
		const selected = prime.variants.get("top-diagonal-cut-bottom-vertical-cut").selector["cyrl/ef"];
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x444)), path(`cyrl/ef.${selected}`));
		assert.equal(path("cyrl/ef.BGR"), path(`cyrl/ef.${selected}`));
		for (const top of ["Straight", "DiagonalTailed"]) for (const bottom of ["Straight", "DiagonalTailed"]) {
			const name = `cyrl/ef.top${top}Bottom${bottom}`;
			const contours = glyphStore.queryByNameEnsured(name).geometry.toBezArcs();
			assert.equal(contours.length, 4, name);
			const bounds = contour => {
				const ys = contour.flatMap(arc => [arc.a.y, arc.b.y, arc.c.y, arc.d.y]);
				return [Math.min(...ys), Math.max(...ys)];
			};
			const [stemMin, stemMax] = bounds(contours[0]);
			assert.ok(bounds(contours[2])[0] <= stemMax - 10, `${name}: detached top`);
			assert.ok(bounds(contours[3])[1] >= stemMin + 10, `${name}: detached bottom`);
		}
		for (const name of ["topVerticalCutBottomStraight", "topStraightBottomVerticalCut", "topVerticalCutBottomVerticalCut"]) {
			assert.equal(glyphStore.queryByNameEnsured(`cyrl/ef.${name}`).geometry.toBezArcs().length, 4, name);
		}
		const contours = glyphStore.queryByNameEnsured("cyrl/ef.topDiagonalTailedBottomStraight").geometry.toBezArcs();
		const topY = Math.max(...contours[0].flatMap(arc => [arc.a.y, arc.b.y, arc.c.y, arc.d.y])) - 20;
		const midpointAt = (contour, y) => {
			const intersections = [];
			for (const arc of contour) {
				const at = t => {
					const u = 1 - t;
					return {
						x: u ** 3 * arc.a.x + 3 * u ** 2 * t * arc.b.x + 3 * u * t ** 2 * arc.c.x + t ** 3 * arc.d.x,
						y: u ** 3 * arc.a.y + 3 * u ** 2 * t * arc.b.y + 3 * u * t ** 2 * arc.c.y + t ** 3 * arc.d.y,
					};
				};
				let previous = at(0);
				for (let i = 1; i <= 64; i++) {
					const point = at(i / 64);
					if ((previous.y <= y && point.y > y) || (point.y <= y && previous.y > y)) {
						intersections.push(previous.x + (point.x - previous.x) * (y - previous.y) / (point.y - previous.y));
					}
					previous = point;
				}
			}
			assert.equal(intersections.length, 2);
			return (intersections[0] + intersections[1]) / 2;
		};
		const stemMid = midpointAt(contours[0], topY);
		const topMid = midpointAt(contours[2], topY);
		assert.ok(Math.abs(stemMid - topMid) < 1, `diagonal top center ${topMid} must align with stem center ${stemMid}`);
		for (const name of ["topStraightBottomDiagonalTailed", "diagonalTailedCursive"]) {
			const parts = glyphStore.queryByNameEnsured(`cyrl/ef.${name}`).geometry.toBezArcs();
			const bottomY = Math.min(...parts[0].flatMap(arc => [arc.a.y, arc.b.y, arc.c.y, arc.d.y])) + 4;
			const stem = midpointAt(parts[0], bottomY);
			const tail = midpointAt(parts[parts.length - 1], bottomY);
			assert.ok(Math.abs(stem - tail) < 1, `${name}: diagonal bottom center ${tail} must align with stem center ${stem}`);
		}
		const diagonals = glyphStore.queryByNameEnsured("cyrl/ef.topDiagonalTailedBottomDiagonalTailed").geometry.toBezArcs();
		const slopeFactor = Math.tan((slope === "italic" ? 10 : 0) * Math.PI / 180);
		const width = contour => {
			const xs = contour.flatMap(arc => [arc.a, arc.b, arc.c, arc.d].map(p => p.x - slopeFactor * p.y));
			return Math.max(...xs) - Math.min(...xs);
		};
		assert.ok(Math.abs(width(diagonals[2]) - width(diagonals[3])) < 2, "diagonal tails should have matching extents");
		const legacy = glyphStore.queryByNameEnsured("cyrl/ef.diagonalTailedCursive").geometry.toBezArcs();
		assert.ok(Math.abs(width(diagonals[3]) - width(legacy[legacy.length - 1])) < 2, "legacy diagonal bottom should match");
	});
}
