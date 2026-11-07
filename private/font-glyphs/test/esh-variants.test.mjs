import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const readParams = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(readParams));
const variantData = readParams("variants");
const choices = ["compact", "corner-hooked", "sshaped", "flat-tailed", "diagonal-tailed", "tailed"];
const family = ["esh", "eshCurlyTail", "dotlessiStretchedHookLeftRTail", "reveshLoop", "Is", "is"];
await Geom.Init();

test("lower esh exposes exactly six exclusive choices", () => {
	const prime = Variant.parse(variantData, {}).primes.get("lower-esh");
	assert.deepEqual([...prime.variants.keys()], choices);
});

for (const [weight, slope] of [
	[120, "upright"], [120, "italic"],
	[420, "upright"], [420, "italic"],
	[920, "upright"], [920, "italic"],
]) {
	test(`lower esh variants generate distinct outlines at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const prime = para.variants.primes.get("lower-esh");
		const outlines = new Set();
		const loopBase = glyphStore.queryByNameEnsured("reveshLoop.compact").geometry.toContours().flat();
		const minY = Math.min(...loopBase.map(p => p.y));
		const maxY = Math.max(...loopBase.map(p => p.y));
		const loopTop = points => points.filter(p => p.y > maxY - (maxY - minY) * 0.15);
		const contourArea = contour => contour.reduce((area, p, i) => {
			const q = contour[(i + 1) % contour.length];
			return area + p.x * q.y - q.x * p.y;
		}, 0) / 2;
		const simplify = glyph => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const curlBase = simplify(glyphStore.queryByNameEnsured("eshCurlyTail.compact"));
		const curlCounter = curlBase.map(contourArea).filter(area => area > 0);
		assert.equal(curlBase.length, 2, "compact esh curl must not have disconnected contours or pinholes");
		assert.equal(curlCounter.length, 1, "compact esh curl must have one counter");
		assert.ok(curlCounter[0] > 100, "compact esh curl counter must remain open");
		const jCurl = simplify(glyphStore.queryByNameEnsured("dotlessjCurlyTail.bentHookSerifless"));
		const jCounter = jCurl.find(contour => contourArea(contour) > 0);
		const counter = curlBase.find(contour => contourArea(contour) > 0);
		assert.ok(jCounter, "j curl must have a counter");
		assert.ok(Math.abs(contourArea(counter) / contourArea(jCounter) - 1) < 0.02, "esh and j curl counters must have the same area");
		for (const bound of [Math.min, Math.max]) {
			assert.ok(Math.abs(bound(...counter.map(p => p.y)) - bound(...jCounter.map(p => p.y))) <= 1, "esh and j curl counters must align vertically");
		}
		const width = points => Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
		assert.ok(Math.abs(width(counter) - width(jCounter)) <= 1, "esh and j curl counters must have the same width");
		for (const key of choices) {
			const name = `esh.${prime.variants.get(key).selector.esh}`;
			const contours = glyphStore.queryByNameEnsured(name).geometry.toContours();
			assert.ok(contours.length, `${name}: empty`);
			assert.ok(contours.every(c => c.length >= 3 && c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))), name);
			if (["flat-tailed", "diagonal-tailed", "tailed"].includes(key)) {
				const slope = Math.tan((argv.shape.slopeAngle * Math.PI) / 180);
				const stemEdges = contours.flatMap(c => c.map((p, index) => {
					const q = c[(index + 1) % c.length];
					const dy = q.y - p.y;
					return Math.abs(dy) > 40 && Math.abs((q.x - p.x) / dy - slope) < 0.015;
				})).filter(Boolean);
				assert.ok(stemEdges.length >= 2, `${name}: stem edges must follow the configured italic slope`);
			}
			outlines.add(JSON.stringify(contours));
			for (const member of family.slice(1)) {
				const relatedName = `${member}.${prime.variants.get(key).selector[member]}`;
				const related = glyphStore.queryByNameEnsured(relatedName);
				const relatedContours = related.geometry.toContours();
				assert.ok(relatedContours.length, `${relatedName}: empty`);
				assert.ok(relatedContours.every(c => c.length >= 3 && c.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))), relatedName);
				assert.equal(related.advanceWidth, glyphStore.queryByNameEnsured(`${member}.compact`).advanceWidth, relatedName);
				if (member === "eshCurlyTail") {
					const simplified = simplify(related);
					const counters = simplified.map(contourArea).filter(area => area > 0);
					assert.equal(simplified.length, 2, `${relatedName}: unexpected contours or pinholes`);
					assert.equal(counters.length, 1, `${relatedName}: loop must have one counter`);
					assert.ok(Math.abs(counters[0] - curlCounter[0]) < 1, `${relatedName}: loop counter changed`);
				}
				if (member === "reveshLoop") {
					const actual = loopTop(relatedContours.flat());
					const expected = loopTop(loopBase);
					for (const coord of ["x", "y"]) {
						for (const bound of [Math.min, Math.max]) {
							const diff = bound(...actual.map(p => p[coord])) - bound(...expected.map(p => p[coord]));
							assert.ok(Math.abs(diff) < 1, `${relatedName}: loop ${coord} bounds changed`);
						}
					}
				}
			}
		}
		assert.equal(outlines.size, choices.length, "esh choices must have distinct outlines");
		assert.deepEqual(
			glyphStore.queryByNameEnsured("esh.compact").geometry.toContours(),
			glyphStore.queryByNameEnsured("longs.flatHookTailedSerifless").geometry.toContours(),
		);
		assert.ok(glyphStore.queryByUnicode(0x222b).geometry.toContours().length, "integral must remain present");
	});
}

test("selecting lower esh does not change the integral when character variants are disabled", () => {
	const stores = [];
	for (const choice of choices) {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "italic", slopeAngle: 9.4 },
			featureControl: { noCvSs: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", "lower-esh": choice } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		stores.push(buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true }).glyphStore);
	}
	for (const cp of [0x283, 0x286, 0x285, 0x1aa, 0xa76c, 0xa76d]) {
		const shapes = stores.map(store => JSON.stringify(store.queryByUnicode(cp).geometry.toContours()));
		assert.equal(new Set(shapes).size, choices.length, `U+${cp.toString(16)} must respond to every esh variant`);
	}
	for (const store of stores.slice(1)) {
		assert.deepEqual(
			stores[0].queryByUnicode(0x222b).geometry.toContours(),
			store.queryByUnicode(0x222b).geometry.toContours(),
		);
	}
});
