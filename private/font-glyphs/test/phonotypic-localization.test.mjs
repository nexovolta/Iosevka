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
import { AnyLocalizedForm, LocalizedForm } from "@iosevka/glyph/relation";
import * as Caching from "@iosevka/geometry-cache";
import { buildFont } from "../../../packages/font/src/build-font/index.mjs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = (name) => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variants = read("variants");
const primes = Variant.parse(variants).primes;
const cases = [
	["d", "d", "latn/de.phonotypic"],
	["cyrl-capital-i", "cyrl/I", "Eng.phonotypic"],
	["capital-v", "V", "Ramshorn.phonotypic"],
	["v", "v", "ramshorn.phonotypic"],
	["capital-e", "E", "Schwa.phonotypic"],
	["capital-u", "U", "UBar.phonotypic"],
	["u", "u", "uBar.phonotypic"],
	["t", "t", "latn/the.phonotypic"],
];
const localized = [
	[0x018c, "latn/de.phonotypic"],
	[0x1df79, "latn/the.phonotypic"],
	[0x014a, "Eng.phonotypic"],
	[0xa7cb, "Ramshorn.phonotypic"],
	[0x0264, "ramshorn.phonotypic"],
	[0x018f, "Schwa.phonotypic"],
	[0x01b7, "Ezh.phonotypic"],
	[0x0244, "UBar.phonotypic"],
	[0x0289, "uBar.phonotypic"],
];

function signedArea(contour) {
	return contour.reduce((area, point, index) => {
		const next = contour[(index + 1) % contour.length];
		return area + point.x * next.y - next.x * point.y;
	}, 0) / 2;
}

await Geom.Init();

for (const slope of ["upright", "italic"]) {
	for (const weight of [120, 420, 920]) {
		test(`phonotypic glyph variants resolve with finite outlines at ${weight} ${slope}`, () => {
			const argv = {
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				featureControl: { noCvSs: false },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			};
			const para = init(data, argv);
			Variant.apply(variants, para, argv);
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			});
			for (const [cp, target] of localized) {
				const source = glyphStore.queryByUnicode(cp);
				assert.ok(source, cp.toString(16));
				assert.equal(LocalizedForm.PTMN.get(source), target);
				assert.ok(AnyLocalizedForm.query(source).includes(LocalizedForm.PTMN));
				assert.ok(glyphStore.queryByName(target), target);
			}
			for (const [prime, selector, name] of cases) {
				const suffixes = new Set([...primes.get(prime).variants.values()].map((v) => v.selector[selector]));
				for (const suffix of suffixes) {
					const id = `${name}.${suffix}`;
					const glyph = glyphStore.queryByNameEnsured(id);
					const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
					assert.ok(contours.length, id);
					if (name === "latn/de.phonotypic") assert.equal(contours.length, 3, id);
					if (name === "latn/the.phonotypic") {
						assert.equal(contours.length, 2, id);
						assert.ok(signedArea(contours[0]) * signedArea(contours[1]) < 0, id);
						const xs = contours[1].map((point) => point.x);
						const ys = contours[1].map((point) => point.y);
						assert.ok(Math.max(...xs) - Math.min(...xs) >= 20, id);
						assert.ok(Math.max(...ys) - Math.min(...ys) >= 20, id);
						if (suffix.startsWith("narrowBentHook")) {
							assert.ok(Math.min(...contours[0].map((point) => point.y)) < 0, id);
						}
					}
					if (name === "Eng.phonotypic") assert.equal(contours.length, 1, id);
					if (name === "Ramshorn.phonotypic" || name === "ramshorn.phonotypic") {
						assert.equal(contours.length, 2, id);
					}
					for (const point of contours.flat()) {
						assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), id);
					}
				}

			}
		});
	}
}

test("subset fonts retain PTMN substitutions without changing the default language", async () => {
	const slope = "upright";
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope, slopeAngle: 0 },
		menu: { family: "Phonotypic Test", version: "34.9.0", width: 5, slope, weight: 400 },
		featureControl: { noCvSs: true, noLigation: true, exportGlyphNames: true },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		subset: { include: { text: String.fromCodePoint(...localized.map(([cp]) => cp)) } },
	};
	const makePara = await getParametersT({ paramsDir });
	const cache = await Caching.load(null, "34.9.0", "phonotypic-test");
	const { font, charMap } = await buildFont(makePara(argv), cache);
	const script = font.gsub.scripts.get("latn");
	const language = script.languages.get("PTMN");
	const feature = language.features.find((item) => item.tag === "locl");
	const mappings = new Map(feature.lookups.flatMap((lookup) =>
		[...lookup.mapping].map(([source, target]) => [source.name, target]),
	));
	for (const [cp, target] of localized) {
		assert.ok(mappings.has(`uni${cp.toString(16).toUpperCase().padStart(4, "0")}`), target);
		assert.ok(charMap.some(([name]) => name === target), target);
	}
	assert.ok(!script.defaultLanguage.features.some((item) => item === feature));
});
