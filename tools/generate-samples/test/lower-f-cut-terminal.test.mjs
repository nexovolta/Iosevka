import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import { parse } from "@iosevka/param/variant";
import { Boolean as BooleanGeom } from "typo-geom";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const prime = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes.get("f");
for (const [slope, selection] of [
	["upright", "vertical-cut-serifless"],
	["italic", "diagonal-cut-diagonal-tailed-asymmetric"],
]) {
	test(`lower f cut variants: ${slope}`, async () => {
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { f: selection } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		for (const [key, variant] of prime.variants) {
			if (!key.startsWith("vertical-cut") && !key.startsWith("diagonal-cut") && !key.includes("bottom-vertical-cut") && !key.includes("bottom-diagonal-cut")) continue;
			for (const family of ["f", "fPalatalHook"]) {
				const name = `${family}.${variant.selector.f}`;
				const g = glyph(name);
				const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
				assert.ok(contours.length, name);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			}

			if (!key.includes("bottom-vertical-cut") && !key.includes("bottom-diagonal-cut")) {
				assert.doesNotMatch(variant.selector.fHookBottom, /Cut/);
				assert.doesNotMatch(variant.selector.fengTrill, /Cut/);
			}
		}
		const selector = prime.variants.get(selection).selector;
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x66)), path(`f.${selector.f}`));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x1df00)), path(`fengTrill.${selector.fengTrill}`));
		const suffix = selector.f.replace(/^(vertical|diagonal)Cut/, "").replace(/^./, c => c.toLowerCase());
		assert.equal(path(`fPalatalHook.${selector.f}`), path(`fPalatalHook.${suffix}`));
		assert.notEqual(path("f.verticalCutSerifless"), path("f.serifless"));
		assert.notEqual(path("f.diagonalCutSerifless"), path("f.serifless"));
		const crossbar = name => path(name).split("M").at(-1);
		assert.equal(crossbar("f.verticalCutSerifless"), crossbar("f.serifless"));
		assert.equal(crossbar("f.diagonalCutSerifless"), crossbar("f.serifless"));
		assert.equal(glyph("f.bottomVerticalCut").geometry.toBezArcs().length, 3);
		for (const suffix of ["bottomVerticalCut", "bottomDiagonalCut", "verticalCutBottomDiagonalCut", "cornerHookBottomVerticalCut"]) {
			const fallback = suffix.replace(/Bottom(?:Vertical|Diagonal)Cut/, "Tailed")
				.replace(/^bottom(?:Vertical|Diagonal)Cut/, "tailed")
				.replace(/^(vertical|diagonal)Cut/, "")
				.replace(/^./, c => c.toLowerCase());
			assert.equal(path(`fPalatalHook.${suffix}`), path(`fPalatalHook.${fallback}`), suffix);
			assert.notEqual(path(`f.${suffix}`), path(`f.${fallback}`), suffix);
		}
	});
}

for (const slope of ["upright", "italic"]) for (const weight of [260, 530, 930]) {
	test(`feng trill corner hook: ${slope} ${weight}`, async () => {
		const { para, glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight },
			featureControl: { noCvSs: true },
			metricOverride: { xHeight: 518, cap: 693, ascender: 732, descender: -186, sb: 60, contrast: 1.102, archDepth: 192, smallArchDepth: 256 },
		});
		const metrics = calculateMetrics(para);
		for (const suffix of ["serifless", "narrowSerifless", "seriflessAsymmetric", "tailed", "diagonalTailed", "seriflessCrossbarAtXHeight"]) {
			const name = `fengTrill.${suffix}`;
			const g = glyphStore.queryByNameEnsured(name);
			const horizontalAtXHeight = g.geometry.toBezArcs().flat().some(arc => {
				const points = [arc.a, arc.b, arc.c, arc.d].map(p => g.gizmo.unapply(p));
				return points.every(p => Math.abs(p.y - metrics.XH) < 0.1) &&
					Math.abs(points[3].x - points[0].x) > 0.05 * metrics.Width;
			});
			assert.ok(horizontalAtXHeight, `${name}: crossbar is not at x-height`);
			if (!suffix.includes("Crossbar")) {
				for (const bar of ["CrossbarAtXHeight", "CrossbarAtHalfAscenderHeight"]) {
					assert.equal(glyphPath(g), glyphPath(glyphStore.queryByNameEnsured(`${name}${bar}`)),
						`${name}${bar}: crossbar differs from x-height`);
				}
			}
			const contours = BooleanGeom.removeOverlap(g.geometry.toBezArcs(), "nonZero", 16384);
			assert.equal(contours.length, 1, `${name}: detached or intersecting parts`);
			const segments = contours.flat().map(arc => [arc.a, arc.b, arc.c, arc.d].map(p => g.gizmo.unapply(p)));
			assert.ok(segments.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			const stubs = segments.filter(points =>
				points.every(p => Math.abs(p.y - (metrics.Ascender - metrics.Hook)) < 0.1) &&
				Math.abs(points[3].x - points[0].x) > 1
			).map(points => ({
				center: (points[0].x + points[3].x) / 2,
				width: Math.abs(points[3].x - points[0].x),
				right: Math.max(points[0].x, points[3].x),
			})).sort((a, b) => a.center - b.center);
			assert.equal(stubs.length, 3, `${name}: expected two stubs and a corner hook`);
			const pitch = stubs[1].center - stubs[0].center;
			assert.ok(pitch > stubs[0].width, `${name}: stubs overlap`);
			assert.ok(Math.abs((stubs[2].center - stubs[1].center) - pitch) < 0.5, `${name}: uneven stub spacing`);
			assert.ok(stubs.every(stub => Math.abs(stub.width - stubs[0].width) < 0.5), `${name}: uneven stub widths`);
			const top = segments.filter(points => points.every(p => Math.abs(p.y - metrics.Ascender) < 0.1));
			assert.ok(top.length, `${name}: missing horizontal top`);
			const topRight = Math.max(...top.flat().map(p => p.x));
			const shear = (stubs[2].right - topRight) / metrics.Hook;
			const right = Math.max(...segments.flat().map(p =>
				p.x + shear * (p.y - (metrics.Ascender - metrics.Hook))));
			assert.ok(right - stubs[2].right < 0.1 * metrics.Width, `${name}: corner hook stops short of the right side`);
		}
	});
}
