import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geometry from "@iosevka/geometry";

import { getParametersT } from "../../font/src/param/index.mjs";
import { parse } from "../src/variant.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));
const bodies = [
	["straight", "straight"], ["straight-inverse", "straightInverse"],
	["curly", "curly"], ["curly-inverse", "curlyInverse"],
	["symmetric-touching", "symmetricTouching"], ["symmetric-connected", "symmetricConnected"],
	["cursive-connected", "cursiveConnected"], ["rounded-top", "roundedTop"],
	["rounded-bottom", "roundedBottom"], ["rounded", "rounded"],
];

test("Zhe selectors expose K leg shapes and lowercase-only cursive loops", () => {
	const primes = parse(Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"))).primes;
	for (const [group, selector] of [["cyrl-capital-zhe", "cyrl/Zhe"], ["cyrl-zhe", "cyrl/zhe"]]) {
		const variants = primes.get(group).variants;
		for (const [name, suffix] of bodies) assert.equal(variants.get(name)?.selector[selector], suffix, `${group} ${name}`);
		assert.equal(variants.has("inverse-connected"), false);
		assert.equal(variants.has("rounded-connected"), false);
	}
	assert.equal(primes.get("cyrl-capital-zhe").variants.has("cursive"), false);
	assert.equal(primes.get("cyrl-zhe").variants.get("cursive").selector["cyrl/zhe"], "cursive");
});

test("Zhe variants and their derived forms build at extreme weights", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	for (const serifs of ["sans", "slab"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 400, 900]) {
		const para = makePara({
			shape: { serifs, spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Zhe variants", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
		});
		const names = new Set();
		for (const [, suffix] of [...bodies, ["cursive", "cursive"]]) {
			for (const prefix of ["cyrl/zhe", "cyrl/zheDescender", "cyrl/zhe.BGR", "cyrl/dzzhe.upright/right", "cyrl/dzzhe.italic/right", "cyrl/zhwe/right"])
				names.add(`${prefix}.${suffix}`);
			if (suffix !== "cursive") for (const prefix of ["cyrl/Zhe", "cyrl/ZheDescender", "cyrl/Dzzhe/right", "cyrl/Zhwe/right"])
				names.add(`${prefix}.${suffix}`);
		}
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Cyrillic-Zhe" || id === "Letter-Cyrillic-Dzzhe-Zhwe",
			glyphIsNeeded: id => names.has(id),
		});
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			assert.ok(contours.length, `${slope} ${weight} ${name}: empty`);
			assert.ok(contours.flat().every(point => Number.isFinite(point.x) && Number.isFinite(point.y)), `${slope} ${weight} ${name}: nonfinite`);
			if (/^cyrl\/(?:Zhe|zhe)\.(?:straight|straightInverse|curly|curlyInverse|symmetricTouching|symmetricConnected|cursiveConnected|cursive|roundedTop|roundedBottom|rounded)$/.test(name)) {
				assert.equal(contours.length, name === "cyrl/zhe.cursive" ? 3 : 1, `${serifs} ${slope} ${weight} ${name}`);
			}
		}
	}
});

test("rounded Zhe diagonals extend straight from the central stem", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 400, 900]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Zhe diagonal test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
		});
		const names = ["cyrl/Zhe.roundedTop", "cyrl/zhe.roundedTop", "cyrl/Zhe.roundedBottom", "cyrl/zhe.roundedBottom"];
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Cyrillic-Zhe",
			glyphIsNeeded: id => names.includes(id),
		});
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
			const top = Math.max(...contours.flatMap(c => c.flatMap(a => [glyph.gizmo.unapply(a.a).y, glyph.gizmo.unapply(a.d).y])));
			const crossings = ratio => {
				const y = top * ratio;
				const hits = [];
				for (const contour of contours) for (const arc of contour) {
					let prev = glyph.gizmo.unapply(arc.eval(0));
					for (let i = 1; i <= 64; i++) {
						const next = glyph.gizmo.unapply(arc.eval(i / 64));
						if ((prev.y <= y && next.y > y) || (next.y <= y && prev.y > y))
							hits.push(prev.x + (next.x - prev.x) * (y - prev.y) / (next.y - prev.y));
						prev = next;
					}
				}
				return hits.sort((a, b) => a - b);
			};
			const flipped = name.endsWith("roundedBottom");
			const far = crossings(flipped ? 0.9 : 0.1);
			const near = crossings(flipped ? 0.7 : 0.3);
			assert.equal(far.length, 6, `${slope} ${weight} ${name}: separate stems`);
			const joinX = 2 * near[near.length - 1] - far[far.length - 1];
			assert.ok(Math.abs(joinX - far[3]) < para.width * 0.025, `${slope} ${weight} ${name}: diagonal join ${joinX} vs ${far[3]}`);
		}
	}
});
