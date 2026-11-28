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

test("single-arch m exposes the renamed selectors and variants", async () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const variants = parse(data).primes.get("m").variants;
	for (const suffix of [
		"serifless",
		"bottom-right-serifed",
		"serifed",
		"tailed-serifless",
		"short-leg-serifed",
		"short-leg-tailed-serifed",
	]) {
		assert.ok(variants.has(`earless-corner-single-arch-${suffix}`));
		assert.ok(!variants.has(`earless-single-arch-${suffix}`));
	}
	for (const suffix of [
		"serifless",
		"serifed",
		"top-left-serifed",
		"top-left-and-bottom-right-serifed",
		"top-cut-serifless",
		"short-leg-tailed-serifed",
		"top-cut-short-leg-tailed-serifless",
	]) {
		assert.ok(variants.has(`single-arch-${suffix}`));
		assert.ok(!variants.has(`toothed-single-arch-${suffix}`));
	}
	assert.ok(!variants.has("single-arch-top-cut-top-left-serifed"));

	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const para = makePara({
		shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope: "upright", slopeAngle: 0 },
		menu: { family: "Single-arch m test", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: true, noLigation: true },
	});
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: id => id === "Letter-Latin-Lower-M",
		glyphIsNeeded: id => id.startsWith("m."),
	});
	for (const [key, variant] of variants) {
		assert.ok(glyphStore.queryByName(`m.${variant.selector.m}`), key);
	}
	const contours = key =>
		glyphStore.queryByNameEnsured(`m.${variants.get(key).selector.m}`).geometry.toBezArcs();
	const earless = contours("earless-corner-single-arch-serifless");
	const toothed = contours("single-arch-serifless");
	const maxY = contour =>
		Math.max(...contour.flatMap(arc => Array.from({ length: 25 }, (_, i) => arc.eval(i / 24).y)));
	const xValues = contour =>
		contour.flatMap(arc => Array.from({ length: 25 }, (_, i) => arc.eval(i / 24).x));
	assert.ok(maxY(toothed[0]) > maxY(earless[0]) + 1);
	assert.ok(Math.min(...xValues(toothed[2])) > Math.min(...xValues(earless[2])) + 1);
	assert.ok(Math.min(...xValues(toothed[2])) < Math.max(...xValues(toothed[0])));
	assert.ok(contours("single-arch-top-left-serifed").length > toothed.length);
	assert.notDeepEqual(
		contours("single-arch-top-cut-serifless")[0],
		toothed[0],
	);
	for (const shape of ["", "flat-top-", "single-arch-"]) {
		assert.equal(
			contours(`${shape}short-leg-serifed`).length,
			contours(`${shape}short-leg-top-left-and-bottom-right-serifed`).length + 2,
			`${shape}short-leg middle serif`,
		);
		assert.equal(
			contours(`${shape}short-leg-tailed-serifed`).length,
			contours(`${shape}short-leg-tailed-top-left-serifed`).length + 2,
			`${shape}short-leg tailed middle serif`,
		);
	}
	assert.equal(
		contours("earless-corner-single-arch-short-leg-serifed").length,
		contours("earless-corner-single-arch-short-leg-bottom-right-serifed").length + 2,
	);
	assert.equal(
		contours("earless-corner-single-arch-short-leg-tailed-serifed").length,
		contours("earless-corner-single-arch-short-leg-tailed-serifless").length + 2,
	);
});
