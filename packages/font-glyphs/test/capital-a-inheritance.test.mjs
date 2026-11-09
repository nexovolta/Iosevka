import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");
const choices = [
	"straight-serifless",
	"straight-top-serifed",
	"curly-top-serifed",
	"round-top-serifless",
	"round-top-base-serifed",
	"square-bottom-serifless",
	"square-bottom-top-serifed",
	"square-bottom-base-serifed",
	"square-bottom-tri-serifed",
	"square-bottom-top-serifed-diagonal-bar-rising",
	"square-bottom-top-serifed-diagonal-bar-falling",
	"round-top-serifless-diagonal-bar-rising",
	"round-top-serifless-diagonal-bar-falling",
];

function svgPath(contours) {
	return contours.map(contour => {
		assert.equal(contour[0].type, 0);
		let d = `M${contour[0].x},${contour[0].y}`;
		for (let i = 1; i < contour.length; i++) {
			const p = contour[i], q = contour[(i + 1) % contour.length];
			if (p.type === 0) d += `L${p.x},${p.y}`;
			else if (p.type === 1 && q.type === 2) {
				const r = contour[(i + 2) % contour.length];
				assert.equal(r.type, 0);
				d += `C${p.x},${p.y} ${q.x},${q.y} ${r.x},${r.y}`;
				i += 2;
			} else if (p.type === 3 && q.type === 0) {
				d += `Q${p.x},${p.y} ${q.x},${q.y}`;
				i++;
			} else if (p.type === 3 && q.type === 3) {
				d += `Q${p.x},${p.y} ${(p.x + q.x) / 2},${(p.y + q.y) / 2}`;
			} else throw new Error(`Unexpected point type ${p.type}`);
		}
		return `${d}Z`;
	}).join("");
}

await Geom.Init();
for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`capital A inheritance at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-a": "square-bottom-top-serifed", "capital-e": slope === "italic" ? "top-left-serifed" : "serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const prime = para.variants.primes.get("capital-a");
		const base = [0x41, 0xc6, 0x1df6a].map(cp => glyphStore.queryByUnicode(cp));
		const contoursOf = glyph => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const selectedVariant = prime.variants.get("square-bottom-top-serifed");
		for (const glyph of base) {
			assert.deepEqual(contoursOf(glyph), contoursOf(glyphStore.queryByNameEnsured(selectedVariant.get(glyph))), "default glyph must match selected CV");
		}
		for (const component of ["AE/A/full", "AE/A/reduced"]) {
			assert.deepEqual(contoursOf(glyphStore.queryByNameEnsured(component)), contoursOf(glyphStore.queryByNameEnsured("AE/A.squareBottomTopSerifed")), component);
		}
		const aeBars = ["", "DiagonalBar", "DiagonalBarFalling"].map(suffix =>
			JSON.stringify(contoursOf(glyphStore.queryByNameEnsured(`AE/A.squareBottomTopSerifed${suffix}`))));
		assert.equal(new Set(aeBars).size, 3, "Æ crossbar variants must have distinct outlines");
		const svg = [`<text x="15" y="25">A / Æ / 𝽪 — ${weight} ${slope}</text>`];
		for (const [row, key] of choices.entries()) {
			const variant = prime.variants.get(key);
			assert.ok(variant, key);
			const aSuffix = variant.resolveFor(para, "A");
			const aeSuffix = variant.resolveFor(para, "AE/E.serifless/A");
			const aeReducedSuffix = variant.resolveFor(para, "AE/E.topLeftSerifed/A");
			assert.equal(aeSuffix, aeReducedSuffix, `${key}: AE A serif depends on E`);
			assert.equal(aeSuffix, aSuffix, `${key}: AE A selector`);
			const roundSuffix = variant.resolveFor(para, "A/roundTop");
			if (key.startsWith("square-bottom")) assert.ok(roundSuffix.startsWith("squareTop"), key);
			if (key.startsWith("round-top")) assert.ok(roundSuffix.startsWith("roundedSquareTop"), key);
			if (key.startsWith("square-bottom-top-serifed")) assert.ok(roundSuffix.includes("TopSerifed"), key);
			if (key.startsWith("square-bottom-tri-serifed")) assert.ok(roundSuffix.includes("TriSerifed"), key);
			svg.push(`<text x="15" y="${row * 125 + 105}">${key}</text>`);
			for (const [col, glyph] of base.entries()) {
				const name = variant.get(glyph);
				assert.ok(name, `${key}: missing CV for column ${col}`);
				const selected = glyphStore.queryByNameEnsured(name);
				const contours = contoursOf(selected);
				assert.ok(contours.length, `${key}: ${name} has no contours`);
				assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${key}: ${name} has non-finite points`);
				svg.push(`<path d="${svgPath(contours)}" transform="translate(${330 + col * 130} ${row * 125 + 120}) scale(.13 -.13)"/>`);
			}
		}
		if (process.env.QA_PROOF_DIR) {
			const file = path.join(process.env.QA_PROOF_DIR, `capital-a-inheritance-${weight}-${slope}.svg`);
			writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="${choices.length * 125 + 40}"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="13">${svg.join("\n")}</g></svg>`);
		}
	});
}
