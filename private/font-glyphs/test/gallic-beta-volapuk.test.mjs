import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Geometry from "@iosevka/geometry";
import * as Caching from "@iosevka/geometry-cache";
import * as hb from "harfbuzzjs";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { buildFont } from "../../../packages/font/src/build-font/index.mjs";
import { buildTTF } from "../../../packages/font/src/font-io/index.mjs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

function straightEdges(glyph) {
	const edges = [];
	for (const contour of new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs()) {
		for (const arc of contour) {
			const points = [0, 0.25, 0.5, 0.75, 1].map(t => glyph.gizmo.unapply(arc.eval(t)));
			const [a, b] = [points[0], points[4]];
			const dx = b.x - a.x;
			const dy = b.y - a.y;
			if (Math.abs(dx) < 2) continue;
			if (!points.every((p, i) => Math.abs(p.x - (a.x + dx * i / 4)) < 0.05 && Math.abs(p.y - (a.y + dy * i / 4)) < 0.05)) continue;
			edges.push({ x: a.x, y: a.y, slope: dy / dx });
		}
	}
	return edges;
}

test("Gallic tau, beta, phonotypic Volapuk and Sakha yat follow their staged selectors", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		for (const direction of ["rising", "falling"]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Staged forms QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: {
					"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
					"capital-h": `diagonal-crossbar-${direction}`,
					"capital-b": `standard-broken-${direction}-serifless`,
					"lower-beta": `broken-${direction}`,
					"cyrl-yeri": `broken-${direction}-toothless-rounded-serifless`,
				} },
			});

			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Letter-Latin-Upper-D", "Letter-Latin-Lower-D", "Letter-Latin-Lower-N", "Letter-Latin-Upper-B", "Letter-Cyrillic-Ze", "Letter-Cyrillic-Yeri", "Letter-Cyrillic-Yat", "Orthography"].includes(id),
				glyphIsNeeded: id => /^(?:B\.|D(?:\.|$)|d(?:\.|$)|TauGallicum|tauGallicum|grek\/beta|latn\/beta|(?:Ae|ae|Oe|oe|Ue|ue)Volapuk|cyrl\/(?:Yeri|yeri|yat)|latn\/yatSakha)/.test(id),
			});
			const outline = name => {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				return contours;
			};
			for (const [family, body] of [["TauGallicum", "D"], ["tauGallicum", "d"]]) {
				const suffix = `${para.variantSelector[body]}.${direction}`;
				assert.deepEqual(outline(family), outline(`${family}.${suffix}`));
				assert.notDeepEqual(outline(family), outline(`${family}.${para.variantSelector[body]}.flat`));
			}
			for (const name of ["grek/beta", "latn/beta"]) {
				assert.deepEqual(outline(name), outline(`${name}.broken${direction === "rising" ? "Rising" : "Falling"}`));
				assert.notDeepEqual(outline(name), outline(`${name}.standard`));
			}
			const flatBeta = `grek/beta.flatBottomBroken${direction === "rising" ? "Rising" : "Falling"}`;
			assert.notDeepEqual(outline(flatBeta), outline("grek/beta.flatBottom"));
			assert.notDeepEqual(outline(flatBeta), outline("grek/beta"));
			const horizontal = straightEdges(glyphStore.queryByNameEnsured("B.standardSerifless"))
				.filter(edge => Math.abs(edge.slope) < 0.001 && edge.y > 150 && edge.y < 550)
				.map(edge => edge.y);
			assert.equal(horizontal.length, 2);
			const connectionWidth = Math.abs(horizontal[0] - horizontal[1]);
			const sign = direction === "rising" ? 1 : -1;
			for (const name of ["grek/beta", "latn/beta", "AeVolapuk.phonotypic", "aeVolapuk.phonotypic", "OeVolapuk.phonotypic", "oeVolapuk.phonotypic", "UeVolapuk.phonotypic", "ueVolapuk.phonotypic"]) {
				const intercepts = straightEdges(glyphStore.queryByNameEnsured(name))
					.filter(edge => Math.abs(edge.slope - sign * 0.6) < 0.001)
					.map(edge => edge.y - sign * 0.6 * edge.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - connectionWidth) < 0.1
				)), `${slope} ${weight} ${direction} ${name}: diagonal width matches B connection`);
			}
			for (const name of ["AeVolapuk", "aeVolapuk", "OeVolapuk", "oeVolapuk", "UeVolapuk", "ueVolapuk"]) {
				const target = `${name}.phonotypic`;
				assert.equal(LocalizedForm.PTMN.get(glyphStore.queryByNameEnsured(name)), target);
				assert.notDeepEqual(outline(target), outline(name));
				const source = name.toLowerCase().startsWith("ae")
					? `${target}/base.${para.variantSelector["a/singleStorey.sans"]}`
					: name.toLowerCase().startsWith("ue")
						? `${target}.${para.variantSelector[name.startsWith("U") ? "U" : "u"]}`
						: target;
				assert.deepEqual(outline(target), outline(`${source}.${direction}`));
				assert.notDeepEqual(outline(target), outline(`${source}.closed`));
			}
			const sakha = glyphStore.queryByUnicode(0xab60);
			assert.ok(sakha, "Sakha yat");
			const target = slope === "upright" ? "latn/yatSakha.upright" : "latn/yatSakha.italic";
			assert.deepEqual(
				new Geometry.SimplifyGeometry(sakha.geometry, sakha.gizmo, true).toContours(),
				outline(target),
			);
			if (slope === "upright") {
				assert.deepEqual(outline(target), outline(`${target}.${para.variantSelector["cyrl/yeri"]}`));
				assert.notDeepEqual(outline(target), outline(`${target}.corner`));
			} else {
				assert.deepEqual(outline(target), outline("cyrl/yat.italic"));
				assert.deepEqual(outline("cyrl/yat.italic/yeri"), outline(`cyrl/yat.italic/yeri.${para.variantSelector["cyrl/yeri"]}`));
				assert.notDeepEqual(outline("cyrl/yat.italic/yeri"), outline("cyrl/yat.italic/yeri.corner"));
			}
		}
	}
});

test("OpenType features shape the new alternatives and leave regular Volapuk unchanged", async () => {
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	const para = makePara({
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		menu: { family: "Staged forms QA", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: false, noLigation: true, exportGlyphNames: true },
		variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		subset: { include: { text: "ꟇꟈβꞵꞚꞛꞜꞝꞞꞟꭠ" } },
	});
	const cache = await Caching.load(null, "34.9.0", "staged-forms-test");
	const { font } = await buildFont(para, cache);
	const hbFont = new hb.Font(new hb.Face(new hb.Blob(buildTTF(font)), 0));
	const feature = (primeName, key) => {
		const variant = para.variants.primes.get(primeName).variants.get(key);
		return new hb.Feature(variant.tag, variant.rank);
	};
	const shape = (text, language, features) => {
		const buffer = new hb.Buffer();
		buffer.addText(text);
		buffer.setDirection(hb.Direction.LTR);
		buffer.setScript(text === "β" ? "Grek" : "Latn");
		buffer.setLanguage(language);
		hb.shape(hbFont, buffer, features);
		return buffer.getGlyphInfosAndPositions()[0].codepoint;
	};
	const h = ["rising", "falling"].map(d => feature("capital-h", `diagonal-crossbar-${d}`));
	const b = ["rising", "falling"].map(d => feature("capital-b", `standard-broken-${d}-serifless`));
	const beta = ["rising", "falling"].map(d => feature("lower-beta", `broken-${d}`));
	const yeri = ["rising", "falling"].map(d => feature("cyrl-yeri", `broken-${d}-toothless-rounded-serifless`));
	for (const [chars, features] of [["Ꟈꟈ", h], ["βꞵ", beta], ["ꭠ", yeri]]) {
		for (const char of chars) assert.notEqual(shape(char, "en", [features[0]]), shape(char, "en", [features[1]]), char);
	}
	for (const char of "ꞚꞛꞜꞝꞞꞟ") {
		const normal = shape(char, "en", []);
		assert.equal(shape(char, "en", [b[0]]), normal, char);
		assert.equal(shape(char, "en", [b[1]]), normal, char);
		assert.notEqual(shape(char, "x-hbotptmn", []), normal, char);
		assert.notEqual(shape(char, "x-hbotptmn", [b[0]]), shape(char, "x-hbotptmn", [b[1]]), char);
	}
});
