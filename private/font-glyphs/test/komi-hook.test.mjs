import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as Geometry from "@iosevka/geometry";
import * as Caching from "@iosevka/geometry-cache";
import * as hb from "harfbuzzjs";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { buildFont } from "../../../packages/font/src/build-font/index.mjs";
import { buildTTF } from "../../../packages/font/src/font-io/index.mjs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

test("Komi hook serifs are selected independently of the letter bodies", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const [serifs, expected] of [["sans", "serifless"], ["slab", "serifed"]]) {
		const para = makePara({
			shape: { serifs, spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
			menu: { family: "Komi QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		assert.equal(para.variantSelector["cyrl/komiHook"], expected);
	}
	const glyphs = [
		["DjeKomi", "P", 0x502], ["djeKomi", "cyrl/djeKomi", 0x503],
		["ZjeKomi", "cyrl/Ze/topSerif", 0x504], ["zjeKomi", "cyrl/ze/topSerif", 0x505],
		["LjeKomi", "cyrl/El", 0x508], ["ljeKomi", "cyrl/el", 0x509],
		["NjeKomi", "cyrl/NjeKomi", 0x50a], ["njeKomi", "cyrl/njeKomi", 0x50b],
		["SjeKomi", "C/topSerif", 0x50c], ["sjeKomi", "c/topSerif", 0x50d],
		["TjeKomi", "T/rTailBase", 0x50e],
		["tjeKomi.upright", "T/rTailBase"], ["tjeKomi.italic", "cyrl/tjeKomi.italic"],
	];
	const blocks = new Set([
		"Letter-Cyrillic-Upper-Komi-De-Dje", "Letter-Cyrillic-El", "Letter-Cyrillic-Ze",
		"Letter-Latin-Lower-D", "Letter-Latin-Upper-H", "Letter-Latin-Upper-G",
		"Letter-Latin-Upper-T", "Letter-Latin-Lower-M", "Orthography",
	]);
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		for (const hook of ["serifless", "motion-serifed", "serifed"]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Komi QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: {
					"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
					"capital-p": "open-motion-serifed", "komi-hook": hook,
				} },
			});

			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => blocks.has(id),
				glyphIsNeeded: id => /^cyrl\/(?:DjeKomi|djeKomi|ZjeKomi|zjeKomi|LjeKomi|ljeKomi|NjeKomi|njeKomi|SjeKomi|sjeKomi|TjeKomi|tjeKomi)(?:\.|$)/.test(id),
			});
			const contours = glyph => new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			for (const [shortName, bodySelector, codepoint] of glyphs) {
				const name = `cyrl/${shortName}`;
				const selected = glyphStore.queryByNameEnsured(name);
				const suffix = `${para.variantSelector[bodySelector]}.${para.variantSelector["cyrl/komiHook"]}`;
				const outline = contours(selected);
				assert.ok(outline.length && outline.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				assert.deepEqual(outline, contours(glyphStore.queryByNameEnsured(`${name}.${suffix}`)), `${name}: ${suffix}`);
				if (codepoint) assert.deepEqual(outline, contours(glyphStore.queryByUnicode(codepoint)));
				if (hook === "serifed") {
					assert.notDeepEqual(outline, contours(glyphStore.queryByNameEnsured(`${name}.${para.variantSelector[bodySelector]}.serifless`)), name);
				}
			}
			const tje = glyphStore.queryByUnicode(0x50f);
			assert.ok(tje);
			assert.deepEqual(contours(tje), contours(glyphStore.queryByNameEnsured(`cyrl/tjeKomi.${slope}`)));
			assert.notDeepEqual(
				contours(glyphStore.queryByNameEnsured("cyrl/DjeKomi.openMotionSerifed.serifless")),
				contours(glyphStore.queryByNameEnsured("cyrl/DjeKomi.closedMotionSerifed.serifless")),
			);
		}
	}
});

test("Komi hook and P character variants work together in an italic font", async () => {
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const para = makePara({
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "italic", slopeAngle: 9.4 },
		menu: { family: "Komi CV QA", version: "34.9.0", width: 5, slope: "italic", weight: 400 },
		featureControl: { noCvSs: false, noLigation: true, exportGlyphNames: true },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		subset: { include: { text: "ԀԂԃԄԅԈԉԊԋԌԍԎԏѤѥ⪣" } },
	});
	const cache = await Caching.load(null, "34.9.0", "komi-hook-test");
	const { font } = await buildFont(para, cache);
	const hbFont = new hb.Font(new hb.Face(new hb.Blob(buildTTF(font)), 0));
	const hook = para.variants.primes.get("komi-hook");
	const p = para.variants.primes.get("capital-p");
	const feature = (prime, key) => new hb.Feature(prime.tag, prime.variants.get(key).rank);
	function shape(char, features) {
		const buffer = new hb.Buffer();
		buffer.addText(char);
		buffer.guessSegmentProperties();
		hb.shape(hbFont, buffer, features);
		return buffer.getGlyphInfosAndPositions()[0].codepoint;
	}
	for (const char of "ԂԃԄԅԈԉԊԋԌԍԎԏ") {
		const variants = ["serifless", "motion-serifed", "serifed"].map(key => shape(char, [feature(hook, key)]));
		assert.equal(new Set(variants).size, 3, char);
	}
	for (const key of ["serifless", "motion-serifed", "serifed"]) {
		const features = [feature(hook, key)];
		assert.notEqual(
			shape("Ԃ", [...features, feature(p, "open-serifless")]),
			shape("Ԃ", [...features, feature(p, "closed-serifless")]),
			key,
		);
		const el = para.variants.primes.get("cyrl-capital-el");
		assert.notEqual(
			shape("Ԉ", [...features, feature(el, "standard-serifless")]),
			shape("Ԉ", [...features, feature(el, "triangular-serifless")]),
			key,
		);
	}
});
