import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
await Geom.Init();

test("existing variant feature tags remain stable", () => {
	const primes = Variant.parse(variants, {}).primes;
	for (const [name, tag] of [["capital-k", "cv36"], ["k", "cv37"], ["capital-y", "cv81"], ["cyrl-capital-u", "VXCO"]]) {
		assert.equal(primes.get(name).tag, tag, name);
	}
	assert.notEqual(primes.get("cyrl-capital-ue").tag, primes.get("cyrl-ue").tag);
});

for (const [weight, slope] of [[120, "upright"], [420, "upright"], [920, "upright"], [920, "italic"]]) {
	test(`rounded K Y and Ue variants ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: {
				"capital-y": "rounded-serifless", "cyrl-capital-ue": "straight-serifless",
				"cyrl-ue": "rounded-serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless",
			} },
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		assert.equal(para.variantSelector.Y, "roundedSerifless");
		assert.equal(para.variantSelector["cyrl/Ue"], "straightSerifless");
		assert.equal(para.variantSelector["cyrl/ue"], "roundedSerifless");
		assert.equal(para.variantSelector.K, "straightSerifless");
		const reverseArgv = { ...argv, variants: { design: { ...argv.variants.design,
			"cyrl-capital-ue": "rounded-serifless", "cyrl-ue": "straight-serifless",
			"capital-k": "rounded-serifless", k: "rounded-serifless",
		} } };
		const reverse = init(data, reverseArgv);
		Variant.apply(variants, reverse, reverseArgv);
		assert.equal(reverse.variantSelector["cyrl/Ue"], "roundedSerifless");
		assert.equal(reverse.variantSelector["cyrl/ue"], "straightSerifless");
		assert.equal(reverse.variantSelector.K, "roundedSerifless");
		assert.equal(reverse.variantSelector.k, "roundedSerifless");
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		for (const name of ["K.roundedSerifless", "k.roundedSerifless"]) {
			const glyph = glyphStore.queryByNameEnsured(name);
			for (const anchor of ["armOverlay", "legOverlay"]) {
				assert.ok(Number.isFinite(glyph.baseAnchors[anchor]?.x) && Number.isFinite(glyph.baseAnchors[anchor]?.y), `${name} ${anchor}`);
			}
		}
		const hookedY = glyphStore.queryByNameEnsured("YHookRight.roundedSerifless");
		assert.ok(Number.isFinite(hookedY.baseAnchors.overlay?.x));
		assert.ok(hookedY.geometry.toContours().flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
		if (weight === 420 && slope === "upright") {
			for (const [prefix, top] of [["KVBar", para.cap], ["smcpKVBar", para.xHeight]]) {
				for (const [body, expected] of [
					["straight", top * 0.42 - para.stroke], ["curly", top * 0.375],
					["symmetricTouching", top / 2], ["symmetricConnected", top / 2],
					["symmetricConnectedKH", top / 2], ["symmetricConnectedVB", top / 2],
					["inverseConnected", top * 0.58 + para.stroke], ["roundedConnected", top * 0.4],
				]) {
					const contours = glyphStore.queryByNameEnsured(`${prefix}.${body}Serifless`).geometry.toContours();
					const bar = contours[contours.length - 1];
					const ys = bar.map(p => p.y);
					const center = (Math.min(...ys) + Math.max(...ys)) / 2;
					assert.ok(Math.abs(center - expected) < 0.01, `${prefix} ${body}: ${center} != ${expected}`);
				}
			}
		}
		for (const [primeName, codes] of [
			["capital-k", [0x4b, 0x198]], ["k", [0x6b, 0x199]],
			["cyrl-capital-ka", [0x49c, 0x51e]], ["cyrl-ka", [0x49d, 0x51f]],
			["capital-y", [0x59, 0xa5]], ["cyrl-capital-ue", [0x4ae, 0x4b0]],
			["cyrl-ue", [0x4af, 0x4b1]],
		]) {
			const prime = para.variants.primes.get(primeName);
			for (const [key, variant] of prime.variants) {
				if (!key.startsWith("rounded-")) continue;
				for (const code of codes) {
					const glyph = glyphStore.queryByUnicode(code);
					const name = variant.get(glyph);
					assert.ok(name, `${primeName} ${key} U+${code.toString(16)}`);
					const target = glyphStore.queryByNameEnsured(name);
					const contours = target.geometry.toContours();
					assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				}
			}
		}
	});
}
