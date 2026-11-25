import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { calculateMetrics } from "@iosevka/font-glyphs/aesthetics";
import { AnyCv } from "@iosevka/glyph/relation";
import { parse } from "@iosevka/param/variant";
import { Boolean as BooleanGeom } from "typo-geom";
import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const primes = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes;
function edgeAt(glyph, y, left) {
	const hits = [];
	for (const contour of glyph.geometry.toBezArcs()) {
		for (const arc of contour) {
			let a = glyph.gizmo.unapply(arc.eval(0));
			for (let j = 1; j <= 32; j++) {
				const b = glyph.gizmo.unapply(arc.eval(j / 32));
				if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
					hits.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
				}
				a = b;
			}
		}
	}
	assert.ok(hits.length, `missing outline at ${y}`);
	return left ? Math.min(...hits) : Math.max(...hits);
}

function assertCutGeometry(glyphStore, para) {
	const metrics = calculateMetrics(para);
	const etStroke = metrics.AdviceStroke2(2.5, 3, metrics.CAP);
	const etLowerCounterTop = metrics.CAP * metrics.OverlayPos
		+ etStroke * (metrics.CThin - 0.5) - metrics.Stroke;
	for (const family of ["e", "reve"]) {
		for (const bar of ["flatCrossbar", "diagonalCrossbar", "diagonalCrossbarFalling"]) {
			const cut = glyphStore.queryByNameEnsured(`${family}.${bar}VerticalCut`);
			const reference = glyphStore.queryByNameEnsured(`${family}.${bar}FlatHook`);
			assert.equal(BooleanGeom.removeOverlap(cut.geometry.toBezArcs(), "nonZero", 16384).length, 2, `${family}.${bar}`);
			for (const fraction of [0.48, 0.6]) {
				const y = fraction * para.xHeight;
				assert.ok(Math.abs(edgeAt(cut, y, family === "reve") - edgeAt(reference, y, family === "reve")) < 1,
					`${family}.${bar} clips the crossbar or opposite side at ${fraction} x-height`);
			}
		}
	}
	for (const name of ["ampersand.etToothlessCorner", "ampersand.upperOpenEtToothlessCorner", "ampersand.closedEtToothlessCorner"]) {
		const glyph = glyphStore.queryByNameEnsured(name);
		const contours = BooleanGeom.removeOverlap(glyph.geometry.toBezArcs(), "nonZero", 16384);
		const counters = contours.map(contour => contour.map(arc =>
			[arc.a, arc.b, arc.c, arc.d].map(point => glyph.gizmo.unapply(point))));
		const lowerCounter = counters.find(contour => {
			const ys = contour.flat().map(point => point.y);
			return Math.min(...ys) > 0 && Math.max(...ys) < 0.6 * para.cap;
		});
		assert.ok(lowerCounter, `${name} lower counter`);
		const maxY = Math.max(...lowerCounter.flat().map(point => point.y));
		assert.ok(Math.abs(maxY - etLowerCounterTop) < 0.1, `${name} lower bowl is not at its legacy height`);
		assert.ok(lowerCounter.some(points =>
			points.every(point => Math.abs(point.y - maxY) < 0.5) &&
			Math.abs(points[3].x - points[0].x) > 0.15 * para.stroke),
			`${name} lower counter does not join the crossbar horizontally`);
	}
}

function assertCutTargets(glyphStore) {
	const ampersand = glyphStore.queryByUnicodeEnsured(0x26);
	const ampersandCvs = AnyCv.query(ampersand);
	for (const [key, variant] of primes.get("ampersand").variants) {
		if (!key.includes("vertical-cut") && !key.includes("diagonal-cut")) continue;
		const cv = ampersandCvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
		assert.ok(cv, `ampersand.${key}`);
		assert.equal(
			glyphPath(glyphStore.queryByNameEnsured(cv.get(ampersand))),
			glyphPath(glyphStore.queryByNameEnsured(`ampersand.${variant.selector.ampersand}`)),
			`ampersand.${key}`,
		);
	}
	for (const [family, code, name, selector] of [
		["e", 0x65, "e", "e"],
		["g", 0x67, "g", "g"],
		["lower-schwa", 0x259, "schwa", "schwa"],
		["capital-schwa", 0x18f, "Schwa", "Schwa"],
	]) {
		const glyph = glyphStore.queryByUnicodeEnsured(code);
		const cvs = AnyCv.query(glyph);
		for (const [key, variant] of primes.get(family).variants) {
			if (!key.includes("vertical-cut") && !key.includes("diagonal-cut")) continue;
			const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
			assert.ok(cv, `${family}.${key}`);
			assert.equal(glyphPath(glyphStore.queryByNameEnsured(cv.get(glyph))),
				glyphPath(glyphStore.queryByNameEnsured(`${name}.${variant.selector[selector]}`)),
				`${family}.${key}`);
		}
	}
	for (const cut of ["Vertical", "Diagonal"]) {
		const protectedGlyph = glyphStore.queryByNameEnsured(`gPalatalHook.singleStorey${cut}CutSerifless`);
		const baseline = glyphStore.queryByNameEnsured("gPalatalHook.singleStoreyBentHookSerifless");
		assert.equal(glyphPath(protectedGlyph), glyphPath(baseline), `g palatal ${cut}`);
	}
	for (const [family, name] of [["e", "reve"], ["e", "eBar"], ["e", "eFlourish"], ["e", "ae/e"], ["g", "gStroke"]]) {
		const glyph = glyphStore.queryByNameEnsured(name);
		const cvs = AnyCv.query(glyph);
		for (const [key, variant] of primes.get(family).variants) {
			if (!key.includes("vertical-cut") && !key.includes("diagonal-cut")) continue;
			const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
			const actual = cv ? glyphStore.queryByNameEnsured(cv.get(glyph)) : glyph;
			assert.equal(glyphPath(actual),
				glyphPath(glyphStore.queryByNameEnsured(`${name}.${variant.selector[family]}`)),
				`${name}.${key}`);
		}
	}
}
test("cut CV variants propagate to glyphs and preserve protected hook forms", async () => {
	const { para, glyphStore } = await buildGlyphData({
		paramsDir,
		shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope: "upright", slopeAngle: 0 },
		menu: { family: "Iosevka", version: "34.9.0", width: 5, slope: "upright", weight: 530 },
		featureControl: {},
	});

	assert.ok(para.enableCvSs);
	assertCutTargets(glyphStore);
	assertCutGeometry(glyphStore, para);
	const glyph = glyphStore.queryByUnicodeEnsured(0x1be);
	for (const key of ["corner-vertical-cut", "corner-diagonal-cut"]) {
		const expected = primes.get("glottal-stop").variants.get(key);
		const cv = AnyCv.query(glyph).find(v => v.tag === expected.tag && v.rank === expected.rank);
		assert.ok(cv, key);
		const target = glyphStore.queryByNameEnsured(cv.get(glyph));
		assert.notEqual(glyphPath(target), glyphPath(glyph), key);
	}
	for (const [family, code, key, protectedCode, protectedFamily, protectedSelector] of [
		["a", 0x61, "double-storey-hook-vertical-cut-serifless", 0x1d8f, "aRetroflexHook", "aRetroflexHook"],
		["a", 0x61, "double-storey-hook-diagonal-cut-serifless", 0x1d8f, "aRetroflexHook", "aRetroflexHook"],
		["f", 0x66, "vertical-cut-serifless", 0x1d82, "fPalatalHook", "f"],
		["f", 0x66, "vertical-cut-bottom-diagonal-cut", 0x1d82, "fPalatalHook", "f"],
		["cyrl-ef", 0x444, "top-diagonal-cut-bottom-vertical-cut", null],
		["i", 0x131, "top-diagonal-cut-bottom-diagonal-cut", null],
		["j", 0x237, "plain-top-diagonal-cut", 0x284, "dotlessjBarHookTop", "dotlessjHookTop"],
		["j", 0x237, "top-diagonal-cut-diagonal-cut", 0x284, "dotlessjBarHookTop", "dotlessjHookTop"],
		["l", 0x6c, "top-diagonal-cut-bottom-diagonal-cut", 0x1d85, "lPalatalHook", "l"],
		["capital-j", 0x4a, "vertical-cut-serifless", null],
		["r", 0x72, "diagonal-cut-serifless", 0x1d89, "rPalatalHook", "r"],
		["r", 0x72, "flat-top-vertical-cut-serifless", null],
		["r", 0x72, "earless-rounded-diagonal-cut-serifless", null],
		["t", 0x74, "vertical-cut", 0x1ab, "tPalatalHook", "t"],
		["y", 0x79, "cursive-diagonal-cut-serifless", 0x1b4, "yHookRight", "yHookRight"],
		["long-s", 0x17f, "vertical-cut-tailed", null],
		["lower-eszet", 0xdf, "traditional-diagonal-cut-serifless", null],
		["lower-esh", 0x283, "top-diagonal-cut-bottom-diagonal-cut", null],
	]) {
		const expected = primes.get(family).variants.get(key);
		const g = glyphStore.queryByUnicodeEnsured(code);
		const cv = AnyCv.query(g).find(v => v.tag === expected.tag && v.rank === expected.rank);
		assert.ok(cv, key);
		assert.notEqual(glyphPath(glyphStore.queryByNameEnsured(cv.get(g))), glyphPath(g), key);
		if (protectedCode) {
			const protectedGlyph = glyphStore.queryByUnicodeEnsured(protectedCode);
			const protectedCv = AnyCv.query(protectedGlyph).find(v => v.tag === expected.tag && v.rank === expected.rank);
			const target = protectedCv ? glyphStore.queryByNameEnsured(protectedCv.get(protectedGlyph)) : protectedGlyph;
			const reference = glyphStore.queryByNameEnsured(`${protectedFamily}.${expected.selector[protectedSelector]}`);
			assert.ok(glyphPath(target) === glyphPath(reference), key);
		}
	}
	for (const [key, variant] of primes.get("a").variants) {
		if (!key.includes("hook-vertical-cut") && !key.includes("hook-diagonal-cut")) continue;
		const g = glyphStore.queryByUnicodeEnsured(0x61);
		const cv = AnyCv.query(g).find(v => v.tag === variant.tag && v.rank === variant.rank);
		assert.ok(cv, key);
		assert.equal(glyphPath(glyphStore.queryByNameEnsured(cv.get(g))),
			glyphPath(glyphStore.queryByNameEnsured(`a.${variant.selector.a}`)), key);
	}
	for (const [family, code, prefix, selector] of [
		["i", 0x131, "dotlessi", "dotlessi"],
		["j", 0x237, "dotlessj", "dotlessj"],
		["l", 0x6c, "l", "l"],
		["lower-esh", 0x283, "esh", "esh"],
	]) {
		const g = glyphStore.queryByUnicodeEnsured(code);
		const cvs = AnyCv.query(g);
		for (const [key, variant] of primes.get(family).variants) {
			if (!key.includes("diagonal-cut")) continue;
			const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
			assert.ok(cv, `${family}.${key}`);
			assert.equal(glyphPath(glyphStore.queryByNameEnsured(cv.get(g))),
				glyphPath(glyphStore.queryByNameEnsured(`${prefix}.${variant.selector[selector]}`)),
				`${family}.${key}`);
		}
		for (const code of [0x1d8b, 0x1d98]) {
			const g = glyphStore.queryByUnicodeEnsured(code);
			const cvs = AnyCv.query(g);
			const compact = primes.get("lower-esh").variants.get("compact");
			const baseline = cvs.find(v => v.tag === compact.tag && v.rank === compact.rank);
			const expected = glyphPath(baseline ? glyphStore.queryByNameEnsured(baseline.get(g)) : g);
			for (const [key, variant] of primes.get("lower-esh").variants) {
				if (!key.includes("diagonal-cut")) continue;
				const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
				const target = cv ? glyphStore.queryByNameEnsured(cv.get(g)) : g;
				assert.equal(glyphPath(target), expected, `${code.toString(16)} ${key}`);
			}
		}
	}
	for (const [family, glyphNames] of [
		["f", [["f", "f", "f"], ["fHookBottom", "fHookBottom", "f"], ["fengTrill", "fengTrill", "fengTrill"], ["fPalatalHook", "f", "fPalatalHook"]]],
		["cyrl-ef", [["cyrl/ef", "cyrl/ef", "cyrl/ef"], ["cyrl/ef.BGR", "cyrl/ef.BGR", "cyrl/ef"]]],
	]) {
		for (const [glyphName, selector, source] of glyphNames) {
			const g = glyphStore.queryByNameEnsured(glyphName);
			const cvs = AnyCv.query(g);
			for (const [key, variant] of primes.get(family).variants) {
				if (family === "f" && !key.includes("bottom-vertical-cut") && !key.includes("bottom-diagonal-cut")) continue;
				if (family === "cyrl-ef" && !/(^|-)top-(straight|flat-hooked|rounded-tailed|diagonal-tailed|vertical-cut|diagonal-cut)-bottom-/.test(key)) continue;
				const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
				const target = cv ? glyphStore.queryByNameEnsured(cv.get(g)) : g;
				const expected = glyphStore.queryByNameEnsured(`${source}.${variant.selector[selector]}`);
				assert.equal(glyphPath(target), glyphPath(expected), `${glyphName} ${key}`);
			}
		}
	}
	const insular = glyphStore.queryByUnicodeEnsured(0xa77c);
	const selected = primes.get("r").variants.get("earless-corner-vertical-cut-serifless");
	const insularCv = AnyCv.query(insular).find(v => v.tag === selected.tag && v.rank === selected.rank);
	assert.ok(insularCv, "insular f CV");
	assert.ok(
		glyphPath(glyphStore.queryByNameEnsured(insularCv.get(insular)))
			=== glyphPath(glyphStore.queryByNameEnsured(`fInsular.${selected.selector["r/insularBase"]}`)),
		"insular f CV target",
	);
});

test("lower-a cut selectors resolve in italic without changing retroflex hooks", async () => {
	const { para, glyphStore } = await buildGlyphData({
		paramsDir,
		shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope: "italic", slopeAngle: 9.4 },
		menu: { family: "Iosevka", version: "34.9.0", width: 5, slope: "italic", weight: 530 },
		featureControl: {},
	});
	assertCutTargets(glyphStore);
	assertCutGeometry(glyphStore, para);
	const g = glyphStore.queryByUnicodeEnsured(0x61);
	const retroflex = glyphStore.queryByUnicodeEnsured(0x1d8f);
	const cvs = AnyCv.query(g);
	const retroflexCvs = AnyCv.query(retroflex);
	for (const [key, variant] of primes.get("a").variants) {
		if (!key.includes("hook-vertical-cut") && !key.includes("hook-diagonal-cut")) continue;
		const cv = cvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
		assert.ok(cv, key);
		assert.equal(glyphPath(glyphStore.queryByNameEnsured(cv.get(g))),
			glyphPath(glyphStore.queryByNameEnsured(`a.${variant.selector.a}`)), key);
		const protectedCv = retroflexCvs.find(v => v.tag === variant.tag && v.rank === variant.rank);
		const protectedGlyph = protectedCv ? glyphStore.queryByNameEnsured(protectedCv.get(retroflex)) : retroflex;
		assert.equal(glyphPath(protectedGlyph),
			glyphPath(glyphStore.queryByNameEnsured(`aRetroflexHook.${variant.selector.aRetroflexHook}`)), key);
	}
});
