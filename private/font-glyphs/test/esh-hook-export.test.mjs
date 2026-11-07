import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import main from "@iosevka/font";
import { FontIo, Ot } from "ot-builder";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));

function outline(geometry) {
	assert.ok(geometry);
	if (geometry.contours) return geometry.contours;
	assert.ok(geometry.items);
	return geometry.items.map(item => {
		assert.ok(item.to);
		return { transform: item.transform, contours: outline(item.to.geometry) };
	});
}

for (const noLigation of [true, false]) test(`exported esh variants with ligation ${noLigation ? "disabled" : "enabled"}`, async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), "iosevka-esh-"));
	const output = path.join(dir, "esh.ttf");
	try {
		await main({
			name: "EshHookExportTest",
			paramsDir,
			o: output,
			cache: { input: null, output: path.join(dir, "cache.mpz"), freshAgeKey: "esh-hook-export" },
			featureControl: { noCvSs: false, noLigation, exportGlyphNames: true },
			variants: { design: {
				"lower-esh": "compact",
				"capital-latin-gamma": "serifless",
				"latin-gamma": "serifless",
			} },
			shape: { serifs: "sans", spacing: "term", weight: 920, width: 500, slope: "italic", slopeAngle: 9.4 },
			menu: { family: "Esh Hook Export Test", version: "34.9.0", width: 5, slope: "italic", weight: 900 },
			subset: { include: { text: "\u0283\uAB4D\u1D8B\u1D98\u{1DF17}\u{1DF1C}" } },
		});
		const font = FontIo.readFont(FontIo.readSfntOtf(await readFile(output)), Ot.ListGlyphStoreFactory);
		const feature = font.gsub.features.find(f => f.tag === "VXFS");
		assert.ok(feature, "lower-esh feature must be exported");
		for (const cp of [0x0283, 0xab4d, 0x1d8b, 0x1d98, 0x1df17, 0x1df1c]) {
			const glyph = font.cmap.unicode.get(cp);
			assert.ok(glyph, `missing U+${cp.toString(16)}`);
			const alternates = feature.lookups.flatMap(lookup => lookup.mapping?.get(glyph) || []);
			assert.equal(alternates.length, 6, `U+${cp.toString(16)} must have six exported alternatives`);
			assert.equal(new Set(alternates.map(g => JSON.stringify(outline(g.geometry)))).size, 6,
				`U+${cp.toString(16)} alternatives must have distinct outlines`);
			for (const alternate of alternates) assert.deepEqual(alternate.horizontal, glyph.horizontal);
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
