import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import * as Geom from "@iosevka/geometry";
import { parse } from "@iosevka/param/variant";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const primes = parse(TOML.parse(await readFile(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes;
for (const [slope, cut, body, crossbar] of [
	["upright", "vertical", "toothed", "hooked"],
	["italic", "diagonal", "toothless-rounded", "diagonal-crossbar-falling"],
]) {
	test(`capital G and C-dependent cuts: ${slope}`, async () => {
		const selection = `${body}-${cut}-cut-${crossbar}`;
		const { glyphStore } = await buildGlyphData({
			paramsDir,
			shape: { serifs: "sans", spacing: "term", weight: 530, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 530 },
			featureControl: { noCvSs: true },
			variants: { design: { "capital-g": selection, "capital-c": `${cut}-cut`, c: `${cut}-cut` } },
		});
		const glyph = name => glyphStore.queryByNameEnsured(name);
		const path = name => glyphPath(glyph(name));
		const outline = name => {
			const g = glyph(name);
			const contours = new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours();
			assert.ok(contours.length, name);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
		};
		const variant = primes.get("capital-g").variants.get(selection);
		assert.ok(variant, selection);
		const suffix = variant.selector.G;
		assert.ok(suffix.includes(`${cut}Cut`[0].toUpperCase() + `${cut}Cut`.slice(1)), suffix);
		for (const family of ["G", "smcpG", "GStroke", "GInsular.phonotypic"]) {
			outline(`${family}.${suffix}`);
			assert.notEqual(path(`${family}.${suffix}`), path(`${family}.${suffix.replace(`${cut[0].toUpperCase()}${cut.slice(1)}Cut`, "Serifless")}`), family);
		}
		assert.ok(variant.selector.GHookTop.includes("Serifed"));
		assert.ok(variant.selector["G/descBase"].includes("Serifless"));
		assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(0x47)), path(`G.${suffix}`));
		const top = `top${cut[0].toUpperCase()}${cut.slice(1)}Cut`;
		for (const [cp, family] of [[0x50c, "cyrl/SjeKomi"], [0x50d, "cyrl/sjeKomi"]]) {
			outline(`${family}.${top}.serifless`);
			assert.notEqual(path(`${family}.${top}.serifless`), path(`${family}.serifless.serifless`));
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), path(`${family}.${top}.serifless`));
		}
		for (const [cp, family] of [[0xa762, "ZVisigothic"], [0xa763, "zVisigothic"]]) {
			const name = `${family}.${top}.straightSerifless`;
			outline(name);
			assert.notEqual(path(name), path(`${family}.serifless.straightSerifless`));
			assert.equal(glyphPath(glyphStore.queryByUnicodeEnsured(cp)), path(name));
		}
	});
}
