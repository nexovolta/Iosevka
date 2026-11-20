import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geom from "@iosevka/geometry";
import { buildGlyphs } from "../../font-glyphs/lib/index.mjs";
import * as Caching from "../../geometry-cache/src/index.mjs";
import { buildFont } from "../src/build-font/index.mjs";
import { buildTTF } from "../src/font-io/index.mjs";
import { getParametersT } from "../src/param/index.mjs";

await Geom.Init();
const makePara = await getParametersT({
	paramsDir: fileURLToPath(new URL("../../../params", import.meta.url)),
});
const ears = ["earless-rounded", "earless-corner", "flat-top", "flat-top-serifed"];
const teeth = ["toothless-rounded", "toothless-corner", "flat-bottom", "flat-bottom-serifed"];
const bodies = ["descending", "descending-serifed", "descending-motion-serifed", "cursive"];
const crossings = ["closed", "open", "broken-rising", "broken-falling"];
const symmetries = ["symmetric-bowls", "big-bottom-bowl", "big-top-bowl"];
const heights = ["short", "tall"];

function parameters(slope, weight, design = {}) {
	return makePara({
		shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
		menu: { family: "Matrix test", version: "34.9.0", width: 5, slope, weight: 400 },
		featureControl: { noCvSs: true, noLigation: true },
		variants: { design },
	});
}

test("new beta and ve matrix selectors and feature overflow", () => {
	const para = parameters("upright", 420);
	const beta = para.variants.primes.get("lower-beta");
	const ve = para.variants.primes.get("cyrl-ve");
	const tags = new Set();
	for (const body of bodies) for (const crossing of crossings) for (const symmetry of symmetries) {
		const key = `${body}-${crossing}-${symmetry}`;
		const variant = beta.variants.get(key);
		assert.ok(variant, key);
		assert.match(variant.selector["grek/beta"], /^matrix/);
		assert.equal(variant.selector["latn/beta"], variant.selector["grek/beta"]);
	}
	for (const ear of ears) for (const tooth of teeth) for (const crossing of crossings) {
		for (const symmetry of symmetries) for (const height of heights) {
			const key = `${ear}-${tooth}-${crossing}-${symmetry}-${height}`;
			const variant = ve.variants.get(key);
			assert.ok(variant, key);
			assert.match(variant.selector["cyrl/ve"], /^matrix/);
			assert.equal(variant.selector["cyrl/ve.BGR"], variant.selector["cyrl/ve"]);
			assert.ok(variant.rank >= 1 && variant.rank <= 255, key);
			tags.add(variant.tag);
		}
	}
	assert.deepEqual(tags, new Set([ve.tag, ve.overflowTag]));
	const design = {
		"lower-beta": "descending-motion-serifed-broken-rising-big-top-bowl",
		"cyrl-ve": "flat-top-serifed-flat-bottom-serifed-broken-falling-big-bottom-bowl-tall",
	};
	const selected = parameters("upright", 420, design);
	assert.equal(selected.variantSelector["grek/beta"], beta.variants.get(design["lower-beta"]).selector["grek/beta"]);
	assert.equal(selected.variantSelector["latn/beta"], beta.variants.get(design["lower-beta"]).selector["latn/beta"]);
	assert.equal(selected.variantSelector["cyrl/ve"], ve.variants.get(design["cyrl-ve"]).selector["cyrl/ve"]);
	assert.equal(selected.variantSelector["cyrl/ve.BGR"], ve.variants.get(design["cyrl-ve"]).selector["cyrl/ve.BGR"]);
});

test("new alternates survive OpenType feature serialization", async () => {
	const para = makePara({
		shape: { serifs: "sans", spacing: "normal", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		menu: { family: "Matrix test", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: false, noLigation: true },
		variants: { design: {
			"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
			"lower-beta": "descending-motion-serifed-broken-rising-big-top-bowl",
			"cyrl-ve": "flat-top-serifed-flat-bottom-serifed-broken-falling-big-bottom-bowl-tall",
		} },
		subset: { include: { text: "βꞵв" } },
	});
	const cache = await Caching.load(null, "34.9.0", "beta-ve-matrix-test");
	const { font } = await buildFont(para, cache);
	const ve = para.variants.primes.get("cyrl-ve");
	const beta = para.variants.primes.get("lower-beta");
	for (const [tag, codepoint, count] of [
		[ve.tag, 0x432, 255], [ve.overflowTag, 0x432, 161],
		[beta.tag, 0x3b2, 57], [beta.tag, 0xa7b5, 57],
	]) {
		const glyph = font.cmap.unicode.get(codepoint);
		const lookups = font.gsub.features.filter(feature => feature.tag === tag).flatMap(feature => feature.lookups);
		const alternatives = lookups.map(lookup => lookup.mapping?.get(glyph)).find(Array.isArray);
		assert.equal(alternatives?.length, count, `${tag} U+${codepoint.toString(16)}`);
	}
	assert.ok(buildTTF(font).length > 0);
});

for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
	test(`new beta and ve geometry: ${slope} ${weight}`, () => {
		const para = parameters(slope, weight);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-Upper-B",
			glyphIsNeeded: () => true,
		});
		const ve = para.variants.primes.get("cyrl-ve");
		const beta = para.variants.primes.get("lower-beta");
		const signatures = new Map();
		for (const [prefix, prime, selector] of [
			["smcpB", ve, "cyrl/ve"],
			["grek/beta", beta, "grek/beta"],
		]) {
			for (const variant of prime.variants.values()) {
				const suffix = variant.selector[selector];
				if (!suffix?.startsWith("matrix")) continue;
				const name = `${prefix}.${suffix}`;
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.equal(contours.length, variant.key.includes("-open-") ? 2 : 3, `${name} has a missing counter or disconnected contour`);
				const points = contours.flat().map(p => glyph.gizmo.unapply(p));
				assert.ok(points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				const top = Math.max(...points.map(p => p.y));
				const expectedTop = prefix === "smcpB" && variant.key.endsWith("-short") ? para.xHeight : para.ascender;
				assert.ok(Math.abs(top - expectedTop) < 30, `${name} has wrong height: ${top}`);
				signatures.set(name, JSON.stringify(contours));
				if (prefix === "grek/beta") glyphStore.queryByNameEnsured(`latn/beta.${suffix}`);
			}
		}
		const signature = (key, selector = "cyrl/ve", prefix = "smcpB") => {
			const variant = (selector === "cyrl/ve" ? ve : beta).variants.get(key);
			return signatures.get(`${prefix}.${variant.selector[selector]}`);
		};
		for (const alternatives of [
			ears.map(ear => `${ear}-toothless-rounded-closed-symmetric-bowls-tall`),
			teeth.map(tooth => `earless-rounded-${tooth}-closed-symmetric-bowls-tall`),
			crossings.map(crossing => `earless-rounded-toothless-rounded-${crossing}-symmetric-bowls-tall`),
			symmetries.map(symmetry => `earless-rounded-toothless-rounded-closed-${symmetry}-tall`),
			heights.map(height => `earless-rounded-toothless-rounded-closed-symmetric-bowls-${height}`),
		]) {
			assert.equal(new Set(alternatives.map(key => signature(key))).size, alternatives.length);
		}
		const betaAlternatives = bodies.map(body => `${body}-closed-symmetric-bowls`);
		assert.equal(new Set(betaAlternatives.map(key => signature(key, "grek/beta", "grek/beta"))).size, bodies.length);
		const footBounds = body => {
			const suffix = beta.variants.get(`${body}-closed-symmetric-bowls`).selector["grek/beta"];
			const glyph = glyphStore.queryByNameEnsured(`grek/beta.${suffix}`);
			const points = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours()
				.flat().map(p => glyph.gizmo.unapply(p)).filter(p => p.y < para.descender + 10);
			return [Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x))];
		};
		const plain = footBounds("descending");
		const full = footBounds("descending-serifed");
		const motion = footBounds("descending-motion-serifed");
		assert.ok(motion[0] < plain[0] && Math.abs(motion[0] - full[0]) < 1, "motion serif must extend left");
		assert.ok(Math.abs(motion[1] - plain[1]) < 1 && full[1] > motion[1], "motion serif must not extend right");
	});
}
