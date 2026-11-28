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

test("glottal stop styles expose base-serifed glyphs", async () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const variants = parse(data).primes.get("glottal-stop").variants;
	assert.equal(variants.size, 28);
	const baseSerifed = [...variants].filter(([key]) => key.endsWith("-base-serifed"));
	assert.equal(baseSerifed.length, 14);
	assert.deepEqual(
		baseSerifed.map(([, variant]) => variant.rank).sort((a, b) => a - b),
		Array.from({ length: 14 }, (_, i) => i + 15),
	);

	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const para = makePara({
		shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope: "upright", slopeAngle: 0 },
		menu: { family: "Glottal stop base serif test", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: true, noLigation: true },
	});
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: id => id === "Letter-Latin-Glottal-Stop",
		glyphIsNeeded: id => id.startsWith("glottalStop."),
	});
	for (const [key, variant] of variants) {
		const glyph = glyphStore.queryByName(`glottalStop.${variant.selector.glottalStop}`);
		assert.ok(glyph, key);
		if (!key.endsWith("-base-serifed")) continue;
		const base = glyph.geometry.toBezArcs();
		const plainKey = key.slice(0, -"-base-serifed".length);
		const plain = glyphStore.queryByNameEnsured(
			`glottalStop.${variants.get(plainKey).selector.glottalStop}`,
		);
		assert.notDeepEqual(base, plain.geometry.toBezArcs(), key);
	}
});
