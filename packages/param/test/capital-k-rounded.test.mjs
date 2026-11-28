import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geometry from "@iosevka/geometry";

import { getParametersT } from "../../font/src/param/index.mjs";
import { parse } from "../src/variant.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));

test("capital K and Cyrillic ka expose independent rounded and inverse forms", async () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const parsed = parse(data);
	const groups = [
		["capital-k", "K", "KHookRight"],
		["cyrl-capital-ka", "cyrl/Ka", "cyrl/KaDescender"],
		["cyrl-ka", "cyrl/ka", "cyrl/kaDescender"],
	];
	for (const [name, selector, derived] of groups) {
		const variants = parsed.primes.get(name).variants;
		for (const [body, suffix] of [
			["rounded-top", "roundedTop"],
			["rounded-bottom", "roundedBottom"],
			["rounded", "rounded"],
			["curly-inverse", "curlyInverse"],
		]) {
			for (const serif of ["serifless", "top-left-serifed", "serifed"]) {
				const variant = variants.get(`${body}-${serif}`);
				assert.ok(variant, `${name}: ${body}-${serif}`);
				assert.ok(variant.selector[selector].startsWith(suffix));
				assert.ok(variant.selector[derived].startsWith(suffix));
			}
		}
		const connected = variants.get("rounded-connected");
		assert.ok(connected);
		assert.equal(connected.selector[selector], "cursiveConnectedSerifless");
		assert.equal(variants.has("rounded-connected-serifed"), false);
	}
	for (const [body, suffix] of [["rounded-bottom", "roundedBottom"], ["curly-inverse", "curlyInverse"]]) {
		for (const serif of ["serifless", "top-left-serifed", "serifed"]) {
			const variant = parsed.primes.get("k").variants.get(`${body}-${serif}`);
			assert.ok(variant, `k: ${body}-${serif}`);
			assert.ok(variant.selector.k.startsWith(suffix));
		}
	}

	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const para = makePara({
		shape: { serifs: "sans", spacing: "normal", weight: 400, width: 500, slope: "upright", slopeAngle: 0 },
		menu: { family: "K variant test", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: true, noLigation: true },
		variants: { design: {
			"capital-k": "curly-inverse-serifless",
			"cyrl-capital-ka": "rounded-bottom-serifless",
			"cyrl-ka": "rounded-connected",
		} },
	});
	assert.equal(para.variantSelector.K, "curlyInverseSerifless");
	assert.equal(para.variantSelector["cyrl/Ka"], "roundedBottomSerifless");
	assert.equal(para.variantSelector["cyrl/ka"], "cursiveConnectedSerifless");
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: id => id === "Letter-Latin-K",
		glyphIsNeeded: id => /^(?:K|KHookRight|KDescender|KVBar|KStroke|smcpK|smcpKDescender|smcpKVBar|k|kStroke|cyrl\/(?:Ka|KaDescender|KaVBar|KaStroke|ka|kaDescender|kaVBar|kaStroke))(?:\.|$)/.test(id),
	});
	for (const name of [
		"K", "KHookRight", "cyrl/Ka", "cyrl/KaDescender", "cyrl/KaVBar",
		"cyrl/KaStroke", "cyrl/ka", "cyrl/kaDescender", "cyrl/kaVBar",
		"cyrl/kaStroke", "cyrl/ka.BGR",
		"KHookRight.roundedTopSerifless", "KHookRight.roundedSerifless",
		"KHookRight.roundedBottomSerifless", "KHookRight.curlyInverseSerifless",
		"KHookRight.cursiveConnectedSerifless", "K.cursiveConnectedSerifless",
	]) {
		const glyph = glyphStore.queryByNameEnsured(name);
		assert.ok(glyph.geometry.toBezArcs().length, name);
	}
	assert.notDeepEqual(
		glyphStore.queryByNameEnsured("KHookRight.cursiveConnectedSerifless").geometry.toBezArcs(),
		glyphStore.queryByNameEnsured("K.cursiveConnectedSerifless").geometry.toBezArcs(),
	);
});

test("rounded and inverse K joins remain connected at extreme weights", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 900]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "K join test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
		});
		const names = [
			"KHookRight.roundedTopSerifless",
			"KHookRight.roundedBottomSerifed",
			"KHookRight.curlyInverseSerifed",
			"smcpK.roundedBottomBottomRightSerifed",
		];
		for (const [key, variant] of para.variants.primes.get("k").variants) {
			if (/^(rounded-bottom|curly-inverse)-/.test(key))
				names.push(`k.${variant.selector.k}`);
		}
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-K",
			glyphIsNeeded: id => names.includes(id),
		});
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
			assert.equal(contours.length, 1, `${slope} ${weight} ${name}`);
		}
	}
});

test("all K and Cyrillic ka serif variants have intact outlines", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const groups = [
		["capital-k", "K", "K"],
		["capital-k", "KHookRight", "KHookRight"],
		["cyrl-capital-ka", "cyrl/Ka", "K"],
		["cyrl-ka", "cyrl/ka", "smcpK"],
		["cyrl-ka", "cyrl/ka", "k"],
		["k", "k", "k"],
	];
	for (const slope of ["upright", "italic"]) for (const weight of [120, 400, 900]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "K serif test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
		});
		const names = new Set();
		for (const [group, selector, glyph] of groups)
			for (const variant of para.variants.primes.get(group).variants.values())
				names.add(`${glyph}.${variant.selector[selector]}`);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-K",
			glyphIsNeeded: id => names.has(id),
		});
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			const expected = /^k\.cursive(?:Tailed)?(?:Serifless|TopLeftSerifed|BottomRightSerifed|TopLeftAndBottomRightSerifed|Serifed|FullSerifed)$/.test(name) ? 2 : 1;
			assert.equal(contours.length, expected, `${slope} ${weight} ${name}`);
			assert.ok(contours.flat().every(point => Number.isFinite(point.x) && Number.isFinite(point.y)), `${slope} ${weight} ${name}`);
		}
	}
});
