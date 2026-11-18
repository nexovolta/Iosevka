import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as hb from "harfbuzzjs";
import * as Caching from "@iosevka/geometry-cache";

import { buildFont } from "../../../packages/font/src/build-font/index.mjs";
import { buildTTF } from "../../../packages/font/src/font-io/index.mjs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

for (const [weight, slope, yDesign] of [
	[120, "upright", undefined],
	[420, "italic", undefined],
	[420, "upright", "cursive-serifless"],
]) test(`y belowdot shaping at ${weight} ${slope} ${yDesign || "default"}`, async () => {
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
		menu: { family: "Belowdot QA", version: "34.9.0", width: 5, slope, weight: 400 },
		featureControl: { noCvSs: false, noLigation: true, exportGlyphNames: true },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", ...(yDesign ? { y: yDesign } : {}) } },
		subset: { include: { text: "y\u1ef5\u0323\u1abd\u028e\ua779\u03c3" } },
	};
	const para = makePara(argv);
	const prime = para.variants.primes.get("y");
	const cache = await Caching.load(null, "34.9.0", "y-belowdot-test");
	const { font } = await buildFont(para, cache);
	const hbFont = new hb.Font(new hb.Face(new hb.Blob(buildTTF(font)), 0));

	function shape(text, features) {
		const buffer = new hb.Buffer();
		buffer.addText(text);
		buffer.guessSegmentProperties();
		hb.shape(hbFont, buffer, features);
		return buffer.getGlyphInfosAndPositions().map(g => ({
			id: g.codepoint, advance: g.xAdvance, x: g.xOffset, y: g.yOffset,
		}));
	}

	for (const variant of prime.variants.values()) {
		const features = [new hb.Feature(prime.tag, variant.rank)];
		const y = shape("y", features);
		const precomposed = shape("\u1ef5", features);
		assert.equal(precomposed.length, 1, variant.key);
		assert.equal(precomposed[0].advance, y[0].advance, variant.key);
		for (const mark of ["", "\u0323", "\u1abd"]) {
			const atomic = shape(`\u1ef5${mark}`, features);
			const combining = shape(`y\u0323${mark}`, features);
			assert.deepEqual(atomic, combining, `${variant.key}, ${JSON.stringify(mark)}`);
			assert.equal(atomic.reduce((sum, g) => sum + g.advance, 0), y[0].advance, variant.key);
			if (mark) {
				assert.ok(atomic.length > 1, `${variant.key}: missing combining mark`);
				const visible = atomic.slice(1).filter(g => {
					const extents = hbFont.glyphExtents(g.id);
					return extents && extents.width && extents.height;
				});
				assert.ok(visible.length && visible.every(g => g.y < 0),
					`${variant.key}: mark was not positioned below`);
				assert.ok(atomic.slice(1).every(g => g.advance === 0), `${variant.key}: mark advanced`);
			}
		}
	}

	const sigma = para.variants.primes.get("lower-sigma");
	const variants = Array.from(sigma.variants.values(), v => {
		const features = [new hb.Feature(sigma.tag, v.rank)];
		return { d: shape("\ua779", features), sigma: shape("\u03c3", features) };
	});
	assert.equal(variants.length, 2);
	assert.notEqual(variants[0].d[0].id, variants[1].d[0].id);
	assert.notEqual(variants[0].sigma[0].id, variants[1].sigma[0].id);
	assert.equal(variants[0].d[0].advance, variants[1].d[0].advance);

	const cursive = prime.variants.get("cursive-serifless");
	const cv = new hb.Feature(prime.tag, cursive.rank);
	const turned = shape("\u028e", [cv]);
	const localized = shape("\u028e", [cv, new hb.Feature("UPPH", 1)]);
	assert.notEqual(turned[0].id, localized[0].id);
	assert.equal(turned[0].advance, localized[0].advance);
});
