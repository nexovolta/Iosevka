import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geometry from "@iosevka/geometry";
import { AnyCv, CvDecompose } from "@iosevka/glyph/relation";

import { getParametersT } from "../../font/src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));

test("rounded barred Y forms raise their bowls without moving their bars", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const bowlHeights = new Map();
	for (const slope of ["upright", "italic"]) for (const weight of [120, 400, 900]) {
		for (const body of ["rounded-serifless", "straight-serifless"]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Barred Y test", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: true, noLigation: true },
				variants: { design: { "capital-y": body, "cyrl-capital-ue": body, "cyrl-ue": body } },
			});

			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Latin-Upper-Y" || id === "Mark-Overlay",
				glyphIsNeeded: id => /^(?:Y|cyrl\/(?:Ue|ue|Uo|uo)(?:\/base)?|currency\/yenSign|barOver)(?:\.|$)/.test(id),
			});
			for (const [source, base, barred] of [
				["cyrl/Ue", "cyrl/Uo/base", "cyrl/Uo"],
				["cyrl/ue", "cyrl/uo/base", "cyrl/uo"],
			]) {
				const original = glyphStore.queryByNameEnsured(source);
				const adjusted = glyphStore.queryByNameEnsured(base);
				assert.equal(adjusted.baseAnchors.overlay.y, original.baseAnchors.overlay.y);
				assert.equal(adjusted.advanceWidth, original.advanceWidth);
				if (body.startsWith("rounded"))
					assert.notDeepEqual(adjusted.geometry.toBezArcs(), original.geometry.toBezArcs());
				else
					assert.deepEqual(adjusted.geometry.toBezArcs(), original.geometry.toBezArcs());
				if (body.startsWith("rounded") && slope === "upright") {
					const points = adjusted.geometry.toBezArcs().flatMap(contour => contour.flatMap(arc => [arc.a, arc.d]));
					const middle = points.filter(point => Math.abs(point.x - para.width / 2) < 0.01);
					assert.ok(middle.length, `${weight} ${base} bowl apex`);
					const height = Math.max(...middle.map(point => point.y));
					if (bowlHeights.has(base)) assert.ok(Math.abs(height - bowlHeights.get(base)) < 0.01, `${weight} ${base} bowl height`);
					else bowlHeights.set(base, height);
				}
				assert.deepEqual(CvDecompose.get(glyphStore.queryByNameEnsured(barred)), [source, "barOver"]);
			}
			for (const name of ["cyrl/Uo", "cyrl/uo", "currency/yenSign"]) {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
				assert.equal(contours.length, 1, `${body} ${slope} ${weight} ${name}`);
				if (name === "currency/yenSign" && body.startsWith("rounded") && slope === "upright") {
					const points = glyph.geometry.toBezArcs().flatMap(contour => contour.flatMap(arc => [arc.a, arc.d]));
					const middle = points.filter(point => Math.abs(point.x - para.width / 2) < 0.01);
					assert.ok(middle.length, `${weight} yen bowl apex`);
					const height = Math.max(...middle.map(point => point.y));
					if (bowlHeights.has(name)) assert.ok(Math.abs(height - bowlHeights.get(name)) < 0.01, `${weight} yen bowl height`);
					else bowlHeights.set(name, height);
				}
			}
		}
	}
});

test("barred Cyrillic Ue follows the corresponding character variants", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const para = makePara({
		shape: { serifs: "sans", spacing: "normal", weight: 400, width: 500, slope: "upright", slopeAngle: 0 },
		menu: { family: "Barred Y CV test", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: false, noLigation: true },
		variants: { design: { "cyrl-capital-ue": "straight-serifless", "cyrl-ue": "straight-serifless" } },
	});
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: id => id === "Letter-Latin-Upper-Y" || id === "Mark-Overlay",
		glyphIsNeeded: () => true,
	});
	for (const [name, group] of [["cyrl/Uo", "cyrl-capital-ue"], ["cyrl/uo", "cyrl-ue"]]) {
		const glyph = glyphStore.queryByNameEnsured(name);
		const variant = para.variants.primes.get(group).variants.get("rounded-serifless");
		const relation = AnyCv.query(glyph).find(cv => cv.tag === variant.tag && cv.rank === variant.rank);
		assert.ok(relation, name);
		const target = relation.get(glyph);
		assert.ok(target.includes(`${name}/base.roundedSerifless`), target);
		assert.ok(glyphStore.queryByNameEnsured(target).geometry.toBezArcs().length, target);
	}
});
