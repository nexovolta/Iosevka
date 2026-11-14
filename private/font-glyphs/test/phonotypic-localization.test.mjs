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
import { buildOtl } from "@iosevka/font-otl";
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
const localizedFeatureTags = [
	"LSRB", "LMKD", "LBOS", "LBGR", "LBSH", "LCHU", "LNSM", "LISM",
	"LLSM", "LSJE", "LSJU", "LSKS", "LSSM", "LPLK", "LROM", "LMOL",
	"LTRK", "LAZE", "LCRT", "LGAG", "LJCT", "LKAZ", "LKJJ", "LKMZ",
	"LTAT", "LTLY", "LUDI", "LZZA", "LVIT", "IPPH", "APPH", "UPPH",
	"PTMN",
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
		test(`phonotypic glyph variants resolve with finite outlines at ${weight} ${slope}`, async () => {
			const argv = {
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
			};
			const para = init(data, argv);
			Variant.apply(variants, para, argv);
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			});
			if (weight === 420 && slope === "upright") {
				const makePara = await getParametersT({ paramsDir });
				const otlPara = makePara({
					shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: 0 },
					menu: { family: "Phonotypic Test", version: "34.9.0", width: 5, slope, weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
				});
				const { glyphStore: otlGlyphStore } = buildGlyphs(otlPara);
				const { GSUB } = buildOtl(otlPara, otlGlyphStore);
				const features = new Map(
					Object.entries(GSUB.features).map(([name, feature]) => [feature.tag, { name, feature }]),
				);
				for (const tag of localizedFeatureTags) {
					const entry = features.get(tag);
					assert.ok(entry, tag);
					assert.equal(tag.length, 4, tag);
					assert.ok(entry.feature.lookups.length, tag);
					for (const scriptTag of ["latn", "cyrl", "grek"]) {
						assert.ok(
							GSUB.languages[`${scriptTag}_DFLT`].features.includes(entry.name),
							`${scriptTag} ${tag}`,
						);
					}
				}
				for (const [tag, languageTag] of [
					["LSRB", "cyrl_SRB "],
					["LMKD", "cyrl_MKD "],
					["PTMN", "latn_PTMN"],
				]) {
					const language = GSUB.languages[languageTag];
					const loclName = language.features.find((name) => GSUB.features[name].tag === "locl");
					assert.ok(loclName, languageTag);
					assert.deepEqual(features.get(tag).feature.lookups, GSUB.features[loclName].lookups, tag);
				}
			}
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

test("subset fonts expose custom localization features and PTMN substitutions", async () => {
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
