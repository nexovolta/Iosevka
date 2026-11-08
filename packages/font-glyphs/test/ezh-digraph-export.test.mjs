import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import main from "@iosevka/font";
import * as Variant from "@iosevka/param/variant";
import { FontIo, Ot } from "ot-builder";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));

function outline(geometry) {
	assert.ok(geometry);
	if (geometry.contours) return geometry.contours;
	assert.ok(geometry.items);
	return geometry.items.map(item => ({ transform: item.transform, contours: outline(item.to.geometry) }));
}

test("ezh digraph hooks are exported with live lower-ezh variants", async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), "iosevka-ezh-hooks-"));
	try {
		const output = path.join(dir, "ezh.ttf");
		await main({
			name: "EzhDigraphHooks",
			paramsDir,
			o: output,
			cache: { input: null, output: path.join(dir, "cache.mpz"), freshAgeKey: "ezh-hooks" },
			featureControl: { noCvSs: false, noLigation: false, exportGlyphNames: true },
			variants: { design: { "lower-ezh": "straight-flat-hooked-serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
			menu: { family: "Ezh Digraph Hooks", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
			subset: { include: { text: "\u0292\u01BA\uA763\u1D9A\u{1DF18}\u026E\u02A4\u{1DF05}\u{1DF19}\u{1DF20}\u{1DF21}" } },
		});
		const font = FontIo.readFont(FontIo.readSfntOtf(await readFile(output)), Ot.ListGlyphStoreFactory);
		const variantData = Toml.parse(await readFile(path.join(paramsDir, "variants.toml"), "utf8"));
		const tag = Variant.parse(variantData, {}).primes.get("lower-ezh").tag;
		const feature = font.gsub.features.find(f => f.tag === tag);
		assert.ok(feature, `missing lower-ezh feature ${tag}`);
		for (const cp of [0x292, 0x1ba, 0xa763, 0x1d9a, 0x1df18, 0x26e, 0x2a4, 0x1df05, 0x1df19, 0x1df20, 0x1df21]) {
			const glyph = font.cmap.unicode.get(cp);
			assert.ok(glyph?.geometry, `missing U+${cp.toString(16)}`);
			if ([0x292, 0xa763, 0x1df18, 0x26e, 0x2a4, 0x1df20].includes(cp)) {
				const alternates = feature.lookups.flatMap(lookup => lookup.mapping?.get(glyph) || []);
				assert.ok(alternates.length >= 5, `U+${cp.toString(16)}: missing hook alternates`);
				assert.ok(new Set(alternates.map(g => JSON.stringify(outline(g.geometry)))).size >= 5, `U+${cp.toString(16)}: hook outlines must differ`);
			}
		}
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});
