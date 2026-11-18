import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import * as Caching from "@iosevka/geometry-cache";
import * as hb from "harfbuzzjs";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { buildFont } from "../src/build-font/index.mjs";
import { buildTTF } from "../src/font-io/index.mjs";
import { getParametersT } from "../src/param/index.mjs";

test("yery overflow alternatives select the intended glyphs with HarfBuzz", async () => {
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const para = makePara({
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		menu: { family: "Yery overflow QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: false, noLigation: true, exportGlyphNames: true },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		subset: { include: { text: "ыꙑ" } },
	});
	const prime = para.variants.primes.get("cyrl-yery");
	assert.equal(prime.tag, "VXCV");
	assert.equal(prime.overflowTag, "VXFX");
	const cases = [
		["corner", "VXCV", 1],
		["flat-toothless-rounded-serifed-tailed-i-serifed", "VXCV", 88],
		["broken-rising-toothless-corner-serifless-tailed-i-top-right-motion-serifed", "VXCV", 255],
		["broken-rising-toothless-corner-serifless-tailed-i-serifed", "VXFX", 1],
		["broken-falling-toothless-rounded-serifed-tailed-i-serifed", "VXFX", 89],
	];
	const cache = await Caching.load(null, "34.9.0", "yery-overflow-test");
	const { font } = await buildFont(para, cache);
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Yery"].includes(id),
		glyphIsNeeded: id => /^cyrl\/(?:yeri|yery|yeryBack)(?:\.|$)/.test(id),
	});
	const hbFont = new hb.Font(new hb.Face(new hb.Blob(buildTTF(font)), 0));
	for (const [key, tag, rank] of cases) {
		const variant = prime.variants.get(key);
		assert.equal(variant.tag, tag);
		assert.equal(variant.rank, rank);
		assert.equal(para.variants.selectorTree.get(tag, rank)[1], variant);
		assert.equal(para.variants.selectorTree.get("cyrl-yery", key)[1], variant);
		const exported = prime.toJson().variants.find(v => v.key === key);
		assert.equal(exported.tag, tag);
		assert.equal(exported.rank, rank);
		for (const [char, family, unicodeName] of [["ы", "cyrl/yery", "uni044B"], ["ꙑ", "cyrl/yeryBack", "uniA651"]]) {
			assert.equal(variant.get(glyphStore.queryByNameEnsured(family)), `${family}.${variant.resolveFor(para, family)}`);
			const buffer = new hb.Buffer();
			buffer.addText(char);
			buffer.guessSegmentProperties();
			hb.shape(hbFont, buffer, [new hb.Feature(tag, rank)]);
			const gid = buffer.getGlyphInfosAndPositions()[0].codepoint;
			assert.equal(hbFont.glyphName(gid), `${unicodeName}.${tag}-${rank}`, `${char} ${tag}=${rank}`);
		}
	}
});

test("open Cyrillic bowls and Komi de motion serifs follow their selectors", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Cyrillic QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: {
					"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
					"capital-p": "open-motion-serifed", "cyrl-capital-yeri": "open",
					"cyrl-yeri": "open", "cyrl-capital-yery": "open", "cyrl-yery": "open",
				} },
			});

			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Yer", "Letter-Cyrillic-Yery", "Letter-Cyrillic-Upper-Komi-De-Dje"].includes(id),
				glyphIsNeeded: id => /^cyrl\/(?:Yeri|yeri|Yer|yer|Yery|yery|DeKomi)/.test(id),
			});
			const outline = name => {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				return contours;
			};
			for (const name of ["cyrl/Yeri", "cyrl/yeri", "cyrl/Yer", "cyrl/yer", "cyrl/Yery", "cyrl/yery", "cyrl/YeryBack", "cyrl/yeryBack"]) {
				const open = outline(`${name}.open`);
				const closed = outline(`${name}.corner`);
				assert.deepEqual(outline(name), open, name);
				assert.equal(open.length + 1, closed.length, `${name}: bowl must be open`);
			}
			for (const name of ["cyrl/Yeri", "cyrl/yeri", "cyrl/Yer", "cyrl/yer", "cyrl/Yery", "cyrl/yery", "cyrl/YeryBack", "cyrl/yeryBack"]) {
				for (const bowl of ["flat", "rounded", "open", "brokenRising", "brokenFalling"]) {
					for (const tooth of ["FlatBottom", "Flat", "ToothlessCorner", "ToothlessRounded"]) {
						for (const serif of ["Serifless", "Serifed"]) {
							const glyphName = `${name}.${bowl}${tooth}${serif}`;
							const contours = outline(glyphName);
							assert.equal(contours.length, bowl === "open" ? 1 + (name.includes("ery") || name.includes("eryBack") ? 1 : 0) : 2 + (name.includes("ery") || name.includes("eryBack") ? 1 : 0), glyphName);
						}
					}
				}
			}
			assert.deepEqual(outline("cyrl/DeKomi"), outline("cyrl/DeKomi.openMotionSerifed"));
			assert.equal(outline("cyrl/DeKomi.openMotionSerifed").length + 1, outline("cyrl/DeKomi.closedMotionSerifed").length);
			assert.notDeepEqual(outline("cyrl/DeKomi.openMotionSerifed"), outline("cyrl/DeKomi.openSerifed"));
		}
	}
});

test("staged yer and yery selections reach their dependent forms", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Cyrillic QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: {
				"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
				"cyrl-capital-yeri": "broken-rising-toothless-rounded-serifed",
				"cyrl-yeri": "broken-falling-flat-serifless",
				"cyrl-capital-yery": "broken-rising-flat-bottom-serifed-i-serifed",
				"cyrl-yery": "broken-falling-toothless-corner-serifless-tailed-i-top-right-motion-serifed",
			} },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Yer", "Letter-Cyrillic-Yery", "Letter-Cyrillic-Lje", "Letter-Cyrillic-Nje", "Letter-Cyrillic-Tje", "Letter-Cyrillic-Yat"].includes(id),
			glyphIsNeeded: id => /^cyrl\/(?:Yeri|yeri|Yer|yer|Yery|yery|(?:Lje|lje|Nje|nje|Tje|tje\.upright)\/rightHalf|Yat|yat\.upright)/.test(id),
		});
		const outline = name => {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
			return contours;
		};
		for (const name of ["Yeri", "Yer", "Lje/rightHalf", "Nje/rightHalf", "Tje/rightHalf", "Yat"]) {
			assert.deepEqual(outline(`cyrl/${name}`), outline(`cyrl/${name}.brokenRisingToothlessRoundedSerifed`), name);
		}
		for (const name of ["yeri", "yer", "lje/rightHalf", "nje/rightHalf", "tje.upright/rightHalf", "yat.upright"]) {
			assert.deepEqual(outline(`cyrl/${name}`), outline(`cyrl/${name}.brokenFallingFlatSerifless`), name);
		}
		for (const name of ["yeri.BGR", "yer.BGR"]) {
			assert.deepEqual(outline(`cyrl/${name}`), outline(`cyrl/${name}.brokenFallingFlatSerifless`), name);
		}
		for (const name of ["Yery", "YeryBack"]) {
			assert.deepEqual(outline(`cyrl/${name}`), outline(`cyrl/${name}.brokenRisingFlatBottomSerifedISerifed`), name);
		}
		for (const name of ["yery", "yeryBack"]) {
			assert.deepEqual(outline(`cyrl/${name}`), outline(`cyrl/${name}.brokenFallingToothlessCornerSeriflessTailedITopRightMotionSerifed`), name);
		}
	}
});

test("staged top and bottom serifs remain independent in slab designs", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const para = makePara({
		shape: { serifs: "slab", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		menu: { family: "Cyrillic QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: false, noLigation: true },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
	});
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Yery", "Letter-Cyrillic-Yat"].includes(id),
		glyphIsNeeded: id => /^cyrl\/(?:yeri|yery|yat\.upright)\./.test(id),
	});
	const outline = name => {
		const glyph = glyphStore.queryByNameEnsured(name);
		return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
	};
	for (const family of ["cyrl/yeri", "cyrl/yat.upright"]) {
		assert.notDeepEqual(outline(`${family}.flatFlatSerifless`), outline(`${family}.flatFlatSerifed`), `${family}: top serif`);
		assert.notDeepEqual(outline(`${family}.flatFlatSerifless`), outline(`${family}.flatFlatBottomSerifless`), `${family}: bottom serif`);
	}
	assert.notDeepEqual(outline("cyrl/yery.flatFlatSeriflessISerifless"), outline("cyrl/yery.flatFlatSeriflessISerifed"), "I-stem serif");
	assert.notDeepEqual(outline("cyrl/yery.flatFlatSeriflessISerifless"), outline("cyrl/yery.flatFlatSeriflessTailedISerifless"), "I-stem tail");
});

test("Nje uses the staged yer top serif independently of En", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) for (const en of ["serifless", "serifed"]) {
		const outlines = [];
		for (const top of ["serifless", "serifed"]) {
			const para = makePara({
				shape: { serifs: "slab", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Cyrillic QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: {
					"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
					"cyrl-capital-en": en, "cyrl-en": en,
					"cyrl-capital-yeri": `flat-flat-${top}`, "cyrl-yeri": `flat-flat-${top}`,
				} },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Nje"].includes(id),
				glyphIsNeeded: id => /^cyrl\/(?:Nje|nje)(?:\/|\.|$)/.test(id),
			});
			outlines.push(["cyrl/Nje", "cyrl/nje"].map(name => {
				const glyph = glyphStore.queryByNameEnsured(name);
				return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			}));
		}
		for (let i = 0; i < 2; i++) assert.notDeepEqual(outlines[0][i], outlines[1][i], `${slope} ${weight} ${en}: staged Nje top serif`);
	}
});
