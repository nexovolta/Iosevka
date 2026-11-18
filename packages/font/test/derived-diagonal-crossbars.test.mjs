import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { getParametersT } from "../src/param/index.mjs";

test("diagonal crossbars propagate through A, E and Cyrillic En derivatives", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) {
		for (const weight of [120, 420, 920]) {
			for (const direction of ["rising", "falling"]) {
				const falling = direction === "falling" ? "Falling" : "";
				const para = makePara({
					shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
					menu: { family: "Diagonal QA", version: "34.9.0", width: 5, slope, weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: {
						"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
						"capital-a": `straight-serifless-diagonal-bar-${direction}`,
						"capital-e": `diagonal-crossbar-${direction}`,
						"e": `diagonal-crossbar-${direction}`,
						"cyrl-capital-en": `serifless-diagonal-crossbar-${direction}`,
						"cyrl-en": `serifless-diagonal-crossbar-${direction}`,
					} },
				});

				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: id => ["Letter-Latin-Upper-A", "Letter-Latin-Upper-E", "Letter-Latin-Lower-E", "Letter-Latin-Upper-H", "Letter-Latin-Upper-AA-AO", "Letter-Cyrillic-Little-Yus", "Letter-Cyrillic-Nje"].includes(id),
					glyphIsNeeded: id => /^(?:A\.|AA\/left(?:\.|$)|AU\/A(?:\.|$)|cyrl\/(?:YusLittle(?:Iotated)?|yusLittleClosedIotated)(?:\.|$)|revE(?:\.|$)|eRetroflexHook(?:\.|$)|eFlourish(?:\.|$)|cyrl\/abk\/Che(?:\.|$)|H\.|smcpH\.|cyrl\/En$|cyrl\/en$|cyrl\/Nje\/leftHalf)/.test(id),
				});
				const outline = name => {
					const glyph = glyphStore.queryByNameEnsured(name);
					const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
					assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
					return contours;
				};
				const aSuffix = `straightSeriflessDiagonalBar${falling}`;
				assert.deepEqual(outline("AA/left"), outline(`AA/left.${aSuffix}`));
				assert.deepEqual(outline("cyrl/YusLittle"), outline(`cyrl/YusLittle.${aSuffix}`));
				assert.notDeepEqual(outline(`AA/left.${aSuffix}`), outline("AA/left.straightSerifless"));
				for (const name of ["cyrl/YusLittleIotated", "cyrl/yusLittleClosedIotated"]) {
					assert.deepEqual(outline(name), outline(`${name}.${aSuffix}`));
					assert.notDeepEqual(outline(name), outline(`${name}.straightSerifless`));
				}
				assert.deepEqual(outline("AU/A"), outline(`AU/A.${aSuffix}`));
				assert.notDeepEqual(outline("AU/A"), outline("AU/A.straightSerifless"));
				assert.notDeepEqual(outline(`cyrl/YusLittle.${aSuffix}`), outline("cyrl/YusLittle.straightSerifless"));
				assert.deepEqual(outline("revE"), outline(`revE.diagonalCrossbar${falling}`));
				assert.notDeepEqual(outline("revE"), outline("revE.serifless"));
				for (const name of ["eRetroflexHook", "eFlourish", "cyrl/abk/Che"]) {
					assert.deepEqual(outline(name), outline(`${name}.diagonalCrossbar${falling}`));
					assert.notDeepEqual(outline(name), outline(`${name}.flatCrossbar`));
				}
				assert.deepEqual(outline("cyrl/En"), outline(`H.seriflessDiagonalCrossbar${falling}`));
				assert.deepEqual(outline("cyrl/en"), outline(`smcpH.seriflessDiagonalCrossbar${falling}`));
				assert.deepEqual(outline("cyrl/Nje/leftHalf/full"), outline(`cyrl/Nje/leftHalf.seriflessDiagonalCrossbar${falling}`));
			}
		}
	}
});

test("Cyrillic En diagonal variants resolve for tails and serifs", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const serifs = ["serifless", "top-left-serifed", "top-left-bottom-right-serifed", "serifed", "top-right-motion-serifed", "bilateral-motion-serifed"];
	for (const direction of ["rising", "falling"]) {
		for (const serif of serifs) {
			for (const tail of ["", "tailed-"]) {
				if (tail && serif === "top-left-bottom-right-serifed") continue;
				const para = makePara({
					shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
					menu: { family: "Diagonal QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: {
						"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
						"cyrl-capital-en": `${serif}-diagonal-crossbar-${direction}`,
						"cyrl-en": `${tail}${serif}-diagonal-crossbar-${direction}`,
					} },
				});
				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: id => ["Letter-Latin-Upper-H", "Letter-Cyrillic-Nje"].includes(id),
					glyphIsNeeded: id => /^(?:H\.|smcpH\.|cyrl\/(?:En$|en$|en\.BGR$|NjeKomi|njeKomi|Nje\/leftHalf|nje\/leftHalf))/.test(id),
				});
				for (const name of ["cyrl/En", "cyrl/en", "cyrl/en.BGR", "cyrl/NjeKomi", "cyrl/njeKomi", "cyrl/Nje/leftHalf/full", "cyrl/nje/leftHalf/full"]) {
					assert.ok(glyphStore.queryByName(name), `${tail}${serif} ${direction}: ${name}`);
				}
			}
		}
	}
});

test("A-derived diagonal variants resolve for body and serif combinations", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const direction of ["rising", "falling"]) {
		for (const body of ["straight", "curly", "round-top", "square-bottom"]) {
			for (const serif of ["serifless", "top-serifed", "base-serifed", "tri-serifed"]) {
				if (body === "round-top" && ["top-serifed", "tri-serifed"].includes(serif)) continue;
				const para = makePara({
					shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
					menu: { family: "Diagonal QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
					featureControl: { noCvSs: false, noLigation: true },
					variants: { design: {
						"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
						"capital-a": `${body}-${serif}-diagonal-bar-${direction}`,
					} },
				});
				const { glyphStore } = buildGlyphs(para, {
					blockIsNeeded: id => ["Letter-Latin-Upper-A", "Letter-Latin-Upper-AA-AO", "Letter-Cyrillic-Little-Yus"].includes(id),
					glyphIsNeeded: id => /^(?:A\.|ASquare(?:\.|$)|ASwash(?:\.|$)|AA\/left(?:\.|$)|cyrl\/YusLittleIotated(?:\.|$))/.test(id),
				});
				for (const name of ["ASquare", "ASwash", "AA/left", "cyrl/YusLittleIotated"]) {
					const selected = glyphStore.queryByNameEnsured(name);
					const diagonal = para.variantSelector[name] || para.variantSelector.A;
					const horizontal = diagonal.replace(/DiagonalBar(?:Falling)?$/, "");
					const contours = glyph => new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
					assert.deepEqual(contours(selected), contours(glyphStore.queryByNameEnsured(`${name}.${diagonal}`)));
					assert.notDeepEqual(contours(selected), contours(glyphStore.queryByNameEnsured(`${name}.${horizontal}`)), `${body}-${serif}-${direction}: ${name}`);
				}
			}
		}
	}
});

test("H-derived selectors retain diagonal crossbars with each serif style", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const direction of ["rising", "falling"]) {
		for (const serif of ["", "-top-left-serifed", "-top-left-bottom-right-serifed", "-serifed", "-top-right-motion-serifed", "-bilateral-motion-serifed"]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
				menu: { family: "Diagonal QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: {
					"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
					"capital-h": `diagonal-crossbar-${direction}${serif}`,
				} },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Latin-Upper-H",
				glyphIsNeeded: id => /^(?:H\.|HHookLeft(?:\.|$)|Hwair(?:\.|\/|$))/.test(id),
			});
			for (const name of ["HHookLeft", "Hwair"]) {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), `${direction}${serif}: ${name}`);
			}
			const diagonal = para.variantSelector["Hv/H"];
			const horizontal = diagonal.replace(/DiagonalCrossbar(?:Falling)?$/, "");
			const contours = suffix => {
				const glyph = glyphStore.queryByNameEnsured(`Hwair.${suffix}.roundedSerifless`);
				return new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			};
			assert.notDeepEqual(contours(diagonal), contours(horizontal), `${direction}${serif}: Hwair crossbar`);
		}
	}
});
