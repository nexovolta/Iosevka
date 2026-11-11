import assert from "node:assert/strict";
import { copyFile, mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import main from "@iosevka/font";
import * as Variant from "@iosevka/param/variant";
import { FontIo, Ot } from "ot-builder";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const text = "\u{1DF90}\u{1DF91}\u{1DF92}\u{1DF93}\u{1DF94}\u{1DF95}\u{1DF96}\u{1D6A6}";
const references = "c2m\u03F1\u0263\u0264\u0291\u0292\u029D\u2C74\uA77A\u20B0\u017F";
const weight = Number(process.env.COSSIC_WEIGHT || 420);
const slope = process.env.COSSIC_SLOPE || "upright";
const spacing = process.env.COSSIC_SPACING || "term";
const longSVariant = process.env.COSSIC_LONG_S_VARIANT;

function area(contour) {
	return contour.reduce((sum, p, i) => {
		const q = contour[(i + 1) % contour.length];
		return sum + p.x * q.y - q.x * p.y;
	}, 0) / 2;
}

function glyphContours(glyph) {
	const geometry = glyph.geometry;
	if (geometry.contours) return geometry.contours;
	assert.equal(geometry.items.length, 1, "expected a single alternate glyph reference");
	const { to, transform } = geometry.items[0];
	assert.deepEqual(
		[transform.xx, transform.xy, transform.yx, transform.yy, transform.dx, transform.dy],
		[1, 0, 0, 1, 0, 0],
		"expected an untransformed alternate glyph reference",
	);
	return glyphContours(to);
}

test("Cossic letters export as nonempty glyphs", async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), "iosevka-cossic-"));
	const output = path.join(dir, "cossic.ttf");
	const cache = path.join(dir, "cache.mpz");
	try {
		await main({
			name: "CossicTest",
			paramsDir,
			o: output,
			cache: { input: null, output: cache, freshAgeKey: "cossic-test" },
			featureControl: { noCvSs: false, noLigation: false, exportGlyphNames: true },
			variants: { design: {
				"capital-latin-gamma": "serifless",
				"latin-gamma": "serifless",
				...(longSVariant ? { "long-s": longSVariant } : {}),
			} },
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Cossic Test", version: "34.9.0", width: 5, slope, weight: 400 },
			subset: { include: { text: text + references } },
		});
		const font = FontIo.readFont(FontIo.readSfntOtf(await readFile(output)), Ot.ListGlyphStoreFactory);
		if (process.env.COSSIC_PROOF_TTF) await copyFile(output, process.env.COSSIC_PROOF_TTF);
		for (const char of text) {
			const glyph = font.cmap.unicode.get(char.codePointAt(0));
			assert.ok(glyph?.geometry, `missing outline for U+${char.codePointAt(0).toString(16)}`);
			assert.ok(glyph.horizontal.end > glyph.horizontal.start, `invalid advance for ${char}`);
		}
		for (const cp of [0x1df91, 0x1df92, 0x1df93, 0x1df94, 0x1df96]) {
			const glyph = font.cmap.unicode.get(cp);
			const contours = glyph.geometry.contours;
			assert.ok(contours?.length, `missing contours for U+${cp.toString(16)}`);
			assert.equal(contours.filter(c => area(c) < 0).length, 1, `disconnected ink in U+${cp.toString(16)}`);
			if (cp === 0x1df92 || cp === 0x1df94) {
				assert.ok(contours.some(c => area(c) > 0 && c.reduce((sum, p) => sum + p.x, 0) / c.length > glyph.horizontal.end / 2),
					`closed rho counter in U+${cp.toString(16)}`);
				assert.ok(contours.some(c => c.some((p, i) => {
					const q = c[(i + 1) % c.length];
					return p.kind === 0 && q.kind === 0 && p.y === 0 && q.y === 0 && Math.abs(p.x - q.x) > 10;
				})), `missing flat baseline in U+${cp.toString(16)}`);
			}
			for (const point of contours.flat()) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
		}
		const advance = cp => {
			const horizontal = font.cmap.unicode.get(cp).horizontal;
			return horizontal.end - horizontal.start;
		};
		const penny = font.cmap.unicode.get(0x20b0);
		const pennyContours = penny.geometry.contours;
		assert.equal(pennyContours.filter(c => area(c) < 0).length, 1, "penny must have connected ink");
		const pennyCounters = pennyContours.filter(c => area(c) > 0);
		assert.equal(pennyCounters.length, 1, "penny must retain its upper counter");
		if (slope === "upright") {
			const x = pennyCounters[0].map(p => p.x);
			assert.ok(Math.max(...x) - Math.min(...x) >= advance(0x20b0) * 0.08,
				"penny counter must remain open at heavy weights");
			const allX = pennyContours.flat().map(p => p.x);
			assert.ok(Math.min(...allX) >= 0 && Math.max(...allX) <= advance(0x20b0),
				"penny must fit its advance width");
			if (weight === 920 && spacing === "term") {
				assert.ok(-pennyContours.reduce((sum, c) => sum + area(c), 0) >= 220000,
					"heavy penny must retain its increased stroke weight");
			}
		}
		if (spacing === "quasi-proportional") {
			assert.ok(advance(0x1df92) > advance(0x63), "c with rho must use a wider proportional advance");
			assert.ok(advance(0x1df94) > advance(0x32), "rum with rho must use a wider proportional advance");
			for (const cp of [0x1df92, 0x1df94]) {
				assert.ok(Math.abs(advance(cp) - advance(0x6d) * 8 / 9) <= 1,
					`U+${cp.toString(16)} must use the M-scale proportional advance`);
			}
		} else {
			assert.equal(advance(0x1df92), advance(0x63), "c with rho must retain the monospace advance");
			assert.equal(advance(0x1df94), advance(0x32), "rum with rho must retain the monospace advance");
		}
		const unskew = p => p.x - p.y * Math.tan((slope === "italic" ? 9.4 : 0) * Math.PI / 180);
		const checkCedilla = (glyph, name) => {
			const contours = glyphContours(glyph);
			assert.equal(contours.filter(c => area(c) < 0).length, 1, `${name} must have connected ink`);
			const counters = contours.filter(c => area(c) > 0);
			assert.equal(counters.length, 1, `${name} must have exactly one counter`);
			const x = counters[0].map(unskew);
			const y = counters[0].map(p => p.y);
			assert.ok(Math.max(...y) < 0, `${name} counter must remain below the baseline`);
			assert.ok(Math.max(...x) - Math.min(...x) >= advance(0x1df91) * 0.1,
				`${name} counter must retain its width`);
			assert.ok(Math.max(...y) - Math.min(...y) >= (weight >= 900 ? 40 : 25),
				`${name} counter must not collapse at heavy weights`);
		};
		checkCedilla(font.cmap.unicode.get(0x1df91), "looped cedilla");
		const longS = font.cmap.unicode.get(0x1df96);
		const longSCounters = longS.geometry.contours.filter(c => area(c) > 0);
		assert.ok(longSCounters.some(c => {
			const x = c.map(unskew);
			const y = c.map(p => p.y);
			return Math.min(...y) < 535 && Math.max(...y) > 435
				&& Math.max(...x) - Math.min(...x) >= 25
				&& Math.max(...y) - Math.min(...y) >= 60
				&& Math.min(...x) > advance(0x1df96) * 0.4;
		}), "long s must retain a substantial side-loop counter");
		for (const c of longSCounters) {
			assert.ok(area(c) >= 100, "long s must not have tiny overlap counters");
		}
		if (weight === 920) {
			const stemEdges = longS.geometry.contours.flatMap(c => c.flatMap((p, i) => {
				const q = c[(i + 1) % c.length];
				if (p.kind !== 0 || q.kind !== 0 || Math.min(p.y, q.y) > 200 || Math.max(p.y, q.y) <= 200) return [];
				return [p.x + (q.x - p.x) * (200 - p.y) / (q.y - p.y)];
			})).sort((a, b) => a - b);
			assert.equal(stemEdges.length, 2, "long s must have one stem below the bar");
			assert.ok(stemEdges[1] - stemEdges[0] >= 78, "heavy long s stem must retain its increased weight");
		}
		const longSPoints = longS.geometry.contours.flat();
		assert.ok(Math.abs(Math.max(...longSPoints.map(p => p.y)) - 735) <= 15,
			"long s hook and loop must reach ascender height");
		if (longSVariant) {
			const bottom = Math.min(...longSPoints.map(p => p.y));
			if (longSVariant.includes("descending") || longSVariant.includes("tailed")) {
				assert.ok(bottom < -100, "descending and tailed long s variants must extend below the baseline");
			} else {
				assert.ok(bottom >= -15, "non-descending long s variants must end at the baseline");
			}
		}
		for (const c of longS.geometry.contours) {
			for (let i = 0; i < c.length; i++) {
				const p = c[i];
				const q = c[(i + 1) % c.length];
				const x = Math.min(unskew(p), unskew(q));
				if (p.kind === 0 && q.kind === 0 && Math.min(p.y, q.y) > 650
					&& x > advance(0x1df96) * 0.2 && x < advance(0x1df96) * 0.65
					&& Math.abs(unskew(p) - unskew(q)) < 2) {
					assert.ok(Math.abs(p.y - q.y) <= 2, "long s hook must not have a vertical join seam");
				}
			}
		}
		if (slope === "upright") {
			const x = longS.geometry.contours.flat().map(p => p.x);
			assert.ok(Math.min(...x) >= 0 && Math.max(...x) <= advance(0x1df96),
				"long s must fit its advance width");
		}
		const dContours = font.cmap.unicode.get(0x1df93).geometry.contours;
		const dCounters = dContours.filter(c => area(c) > 0)
			.map(c => ({ minY: Math.min(...c.map(p => p.y)), maxY: Math.max(...c.map(p => p.y)) }))
			.sort((a, b) => a.minY - b.minY);
		assert.equal(dCounters.length, 2, "rotunda d must have exactly two counters, without overlap slivers");
		assert.ok(dCounters[0].minY < 150 && dCounters[0].maxY > 150,
			"rotunda d must retain a closed lower bowl");
		assert.ok(dCounters[1].minY > dCounters[0].minY && dCounters[1].maxY > dCounters[0].maxY,
			"rotunda d must retain its upper loop");
		const variants = Variant.parse(Toml.parse(await readFile(path.join(paramsDir, "variants.toml"), "utf8")), {});
		for (const [prime, cps] of [
			["c", [0x1df90, 0x1df91, 0x1df92]],
			["two", [0x1df94]],
			["lower-eth", [0x1df93]],
			["long-s", [0x1df96]],
		]) {
			const tag = variants.primes.get(prime).tag;
			const feature = font.gsub.features.find(f => f.tag === tag);
			assert.ok(feature, `missing ${prime} feature ${tag}`);
			for (const cp of cps) {
				const glyph = font.cmap.unicode.get(cp);
				const alternates = feature.lookups.flatMap(lookup => lookup.mapping?.get(glyph) || []);
				assert.ok(alternates.length, `missing ${prime} alternates for U+${cp.toString(16)}`);
				if (cp === 0x1df91) {
					for (const [i, alternate] of alternates.entries()) checkCedilla(alternate, `cedilla variant ${i + 1}`);
				}
			}
		}
		const longSFeature = font.gsub.features.find(f => f.tag === variants.primes.get("long-s").tag);
		const alternatesFor = cp => longSFeature.lookups.flatMap(lookup =>
			lookup.mapping?.get(font.cmap.unicode.get(cp)) || []);
		const plainAlternates = alternatesFor(0x17f);
		const loopAlternates = alternatesFor(0x1df96);
		assert.equal(loopAlternates.length, plainAlternates.length, "looped long s must follow every long s variant");
		assert.equal(loopAlternates.length, 60, "all long s variant combinations must be exported");
		for (let i = 0; i < loopAlternates.length; i++) {
			const loopContours = glyphContours(loopAlternates[i]);
			const plainContours = glyphContours(plainAlternates[i]);
			const bottom = contours => Math.min(...contours.flat().map(p => p.y));
			assert.equal(bottom(loopContours) < -100, bottom(plainContours) < -100,
				`long s variant ${i + 1} must follow the matching bottom`);
			assert.equal(loopContours.filter(c => area(c) < 0).length, 1,
				`long s variant ${i + 1} must have connected ink`);
			const counters = loopContours.filter(c => area(c) > 0);
			assert.equal(counters.length, 1, `long s variant ${i + 1} must not have overlap slivers`);
			assert.ok(area(counters[0]) > 100, `long s variant ${i + 1} must retain its loop counter`);
			assert.ok(Math.abs(Math.max(...loopContours.flat().map(p => p.y)) - 735) <= 15,
				`long s variant ${i + 1} must reach ascender height`);
		}
	} finally {
		await rm(output, { force: true });
		await rm(cache, { force: true });
		await rmdir(dir);
	}
});
