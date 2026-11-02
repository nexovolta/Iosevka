import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { LocalizedForm } from "@iosevka/glyph/relation";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const readParams = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(readParams),
);
const variantData = readParams("variants");

await Geom.Init();

for (const [weight, slope, spacing] of [
	[120, "upright", "term"],
	[420, "upright", "term"],
	[920, "upright", "term"],
	[120, "italic", "quasi-proportional"],
	[420, "italic", "quasi-proportional"],
	[920, "italic", "quasi-proportional"],
]) {
	test(`Che derivatives follow their source: ${weight} ${slope} ${spacing}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing, weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const dependencies = g => g.geometry.getDependencies().map(d => d.identifier);
		const points = g => g.geometry.toContours().flat();
		for (const [prime, base, barred] of [
			["cyrl-capital-che", "cyrl/Che", "cyrl/CheVBar"],
			["cyrl-che", "cyrl/che", "cyrl/cheVBar"],
		]) {
			for (const variant of para.variants.primes.get(prime).variants.values()) {
				const suffix = variant.selector[base];
				const baseName = `${base}.${suffix}`;
				const barredName = `${barred}.${suffix}`;
				const barGlyph = glyph(barredName);
				assert.ok(dependencies(barGlyph).includes(baseName), `${barredName} must reference ${baseName}`);
				assert.equal(variant.get(glyph(barred)), barredName, `${barred}: ${variant.key}`);
				const basePoints = points(glyph(baseName));
				const barContour = barGlyph.geometry.toContours().at(-1);
				const barY = (Math.min(...barContour.map(p => p.y)) + Math.max(...barContour.map(p => p.y))) / 2;
				const top = Math.max(...basePoints.map(p => p.y));
				const expected = suffix.toLowerCase().endsWith("serifless") ? (prime === "cyrl-capital-che" ? 0.35 : 0.4) : 0.45;
				const overshoot = suffix.startsWith("flatHump") ? 0 : para.overshoot;
				assert.ok(Math.abs(barY - top * expected - overshoot) < 0.01, `${barredName}: bar does not follow hump height`);
				if (slope === "upright") {
					const barX = (Math.min(...barContour.map(p => p.x)) + Math.max(...barContour.map(p => p.x))) / 2;
					assert.ok(Math.abs(barX - barGlyph.advanceWidth / 2) < 0.01, `${barredName}: bar is off center`);
				}
				assert.ok(
					Math.max(...barContour.map(p => p.y)) - Math.min(...barContour.map(p => p.y)) > top * 0.12,
					`${barredName}: bar is too short to show above and below the hump`,
				);
				if (prime !== "cyrl-capital-che") {
					const bgrName = `cyrl/cheVBar.BGR.${suffix}`;
					assert.ok(dependencies(glyph(bgrName)).includes(`cyrl/che.BGR.${suffix}`), bgrName);
					assert.equal(variant.get(glyph("cyrl/cheVBar.BGR")), bgrName, variant.key);
					continue;
				}
				const shhaName = `cyrl/Shha.${suffix}`;
				const shha = glyph(shhaName);
				assert.ok(dependencies(shha).includes(baseName), `${shhaName} must reference ${baseName}`);
				assert.equal(variant.get(glyph("cyrl/Shha")), shhaName, variant.key);
				const turned = points(shha);
				assert.equal(turned.length, basePoints.length, shhaName);
				const sumX = Math.min(...basePoints.map(p => p.x)) + Math.max(...turned.map(p => p.x));
				for (let i = 0; i < turned.length; i++) {
					assert.ok(Math.abs(turned[i].x + basePoints[i].x - sumX) < 0.01, shhaName);
					assert.ok(Math.abs(turned[i].y + basePoints[i].y - top) < 0.01, shhaName);
				}
			}
		}
		assert.equal(LocalizedForm.BGR.get(glyph("cyrl/cheVBar")), "cyrl/cheVBar.BGR");
	});
}
