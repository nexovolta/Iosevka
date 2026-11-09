import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as hb from "harfbuzzjs";
import * as Caching from "@iosevka/geometry-cache";

import { buildFont } from "../src/build-font/index.mjs";
import { buildTTF } from "../src/font-io/index.mjs";
import { getParametersT } from "../src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const makePara = await getParametersT({ paramsDir });

async function buildFace(weight, slope, ligations, noLigation = false) {
	const argv = {
		shape: {
			serifs: "sans", spacing: "term", weight, width: 500, slope,
			slopeAngle: slope === "italic" ? 9.4 : 0,
		},
		menu: { family: "Backslash QA", version: "34.9.0", width: 5, slope, weight: 400 },
		featureControl: { noCvSs: false, noLigation, exportGlyphNames: true },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		subset: { include: { text: "\\ab/|=.!:,; " } },
		ligations,
	};
	const cache = await Caching.load(null, "34.9.0", "thin-backslash-test");
	const { font } = await buildFont(makePara(argv), cache);
	const names = new Map();
	for (const base of ["backslash", "backslash.thin", "bar", "slash", "period", "exclam", "colon", "comma", "semicolon"]) {
		for (const suffix of ["", ".lig.dLeft", ".lig.dRight", ".lig.dLeftHalf", ".lig.dRightHalf", ".lig.dMid"]) {
			const name = base + suffix;
			const glyph = font.glyphs.queryByName(name);
			if (glyph?.name) names.set(glyph.name, name);
		}
	}
	const hbFont = new hb.Font(new hb.Face(new hb.Blob(buildTTF(font)), 0));
	return { hbFont, names };
}

function shape({ hbFont, names }, text, features = [], direction = "ltr") {
	const buffer = new hb.Buffer();
	buffer.addText(text);
	buffer.guessSegmentProperties();
	buffer.setDirection(direction === "rtl" ? hb.Direction.RTL : hb.Direction.LTR);
	hb.shape(hbFont, buffer, features);
	return buffer.getGlyphInfosAndPositions().map(g => ({
		id: g.codepoint,
		name: names.get(hbFont.glyphName(g.codepoint)) || hbFont.glyphName(g.codepoint),
		cluster: g.cluster,
		advance: g.xAdvance,
	}));
}

for (const [weight, slope] of [[120, "upright"], [420, "upright"], [920, "upright"], [920, "italic"]]) {
	test(`thin backslash parity at ${weight} ${slope}`, async () => {
		const font = await buildFace(weight, slope);
		const thin = shape(font, "\\")[0];
		const normal = shape(font, "\\", [new hb.Feature("calt", 0)])[0];
		assert.ok(font.hbFont.glyphExtents(thin.id).width < font.hbFont.glyphExtents(normal.id).width,
			"thin backslash must have a thinner outline");
		assert.equal(thin.advance, normal.advance, "thin backslash must retain the advance width");
		for (const direction of ["ltr", "rtl"]) {
			for (const n of [1, 2, 3, 4, 5, 6, 9, 24]) {
				const result = shape(font, "\\".repeat(n), [], direction);
				assert.deepEqual(result.map(g => g.name.replace(/\.lig\..*$/, "")),
					Array.from({ length: n }, (_, i) => i % 2 ? "backslash" : "backslash.thin"),
					`${n} consecutive backslashes, ${direction}`);
				assert.ok(result.every(g => g.advance === result[0].advance), "advances differ");
				const discretionary = shape(font, "\\".repeat(n), [new hb.Feature("dlig", 1)], direction);
				assert.deepEqual(discretionary.map(g => g.name.replace(/\.lig\..*$/, "")),
					Array.from({ length: n }, (_, i) => i % 2 ? "backslash" : "backslash.thin"),
					`${n} consecutive backslashes with dlig, ${direction}`);
				const disabled = shape(font, "\\".repeat(n), [new hb.Feature("calt", 0)], direction);
				assert.ok(disabled.every(g => g.name === "backslash"), "calt=0 must preserve default backslashes");
			}
		}
		assert.deepEqual(shape(font, "a\\\\b\\a").map(g => g.name.replace(/\.lig\..*$/, "")),
			["a", "backslash.thin", "backslash", "b", "backslash.thin", "a"]);
		assert.deepEqual(shape(font, "\\\\/").map(g => g.name.replace(/\.lig\..*$/, "")), ["backslash.thin", "backslash", "slash"]);
		assert.deepEqual(shape(font, "\\\\/", [new hb.Feature("dlig", 1)]).map(g => g.name.replace(/\.lig\..*$/, "")),
			["backslash.thin", "backslash", "slash"]);
		assert.deepEqual(shape(font, "\\\\").map(g => g.name),
			["backslash.thin.lig.dRightHalf", "backslash.lig.dLeftHalf"]);
		for (const ch of ["|", "/", ".", "!", ":", ",", ";"]) {
			for (const text of [ch + "\\", "\\" + ch, ch + "\\\\", "\\\\" + ch]) {
				const result = shape(font, text);
				assert.ok(result.every(g => g.name.includes(".lig.")), `${text}: spacing not applied ${JSON.stringify(result)}`);
				assert.ok(result.some(g => g.name.startsWith("backslash.thin.lig.")), `${text}: thin backslash missing`);
			}
		}
	});
}

test("thin-backslash group can be disabled independently", async () => {
	const font = await buildFace(420, "upright", { inherits: "default-calt", disables: ["thin-backslash"] });
	assert.ok(shape(font, "\\\\").every(g => !g.name.startsWith("backslash.thin")));
	assert.deepEqual(shape(font, "\\\\").map(g => g.name),
		["backslash.lig.dRightHalf", "backslash.lig.dLeftHalf"]);
});

test("no-ligation fonts retain the default backslash", async () => {
	const font = await buildFace(420, "upright", undefined, true);
	assert.deepEqual(shape(font, "\\\\").map(g => g.name), ["backslash", "backslash"]);
});
