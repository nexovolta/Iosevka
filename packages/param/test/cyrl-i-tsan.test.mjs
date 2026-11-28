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

test("Greek tsan follows Cyrillic i, with N-shaped cursive fallbacks", () => {
	const data = Toml.parse(readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8"));
	const { primes } = parse(data);
	for (const [group, selector, greek] of [
		["cyrl-capital-i", "cyrl/I", "grek/Tsan"],
		["cyrl-i", "cyrl/i.upright", "grek/tsan"],
	]) {
		for (const [key, variant] of primes.get(group).variants) {
			assert.ok(variant.selector[greek], `${group} ${key}`);
			if (!key.startsWith("cursive-")) assert.equal(variant.selector[greek], variant.selector[selector], key);
			else assert.match(variant.selector[greek], /^standard(?:Tailed)?/, key);
		}
	}
});

test("tailed Cyrillic i and tsan remain connected at extreme weights", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const issues = [];
	for (const slope of ["upright", "italic"]) for (const weight of [120, 400, 900]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Tsan test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
			variants: { design: { "cyrl-capital-i": "asymmetric-serifless", "cyrl-i": "standard-tailed-serifless" } },
		});
		const names = new Set(["grek/Tsan", "grek/tsan", "cyrl/I", "cyrl/i.upright", "cyrl/i.italic"]);
		for (const variant of para.variants.primes.get("cyrl-i").variants.values()) {
			names.add(`grek/tsan.${variant.selector["grek/tsan"]}`);
			if (variant.selector["cyrl/i.upright"].startsWith("standardTailed") || variant.selector["cyrl/i.upright"].startsWith("asymmetricTailed"))
				names.add(`cyrl/i.upright.${variant.selector["cyrl/i.upright"]}`);
			names.add(`u.${variant.selector["cyrl/i.italic"]}`);
		}
		for (const variant of para.variants.primes.get("cyrl-capital-i").variants.values()) {
			names.add(`grek/Tsan.${variant.selector["grek/Tsan"]}`);
			names.add(`cyrl/I.${variant.selector["cyrl/I"]}`);
		}
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-Upper-N" || id === "Letter-Latin-U",
			glyphIsNeeded: id => names.has(id),
		});
		for (const name of names) {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
			if (contours.length !== 1) issues.push(`${slope} ${weight} ${name}: ${contours.length}`);
		}
	}
	assert.deepEqual(issues, []);
});

test("standard-tailed tsan and Cyrillic i use the full stem weight on the right", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 400]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "normal", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Tsan stem test", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: true, noLigation: true },
		});
		const names = [
			"grek/tsan.standardTailedSerifless", "grek/tsan.asymmetricTailedSerifless",
			"cyrl/i.upright.standardTailedSerifless", "cyrl/i.upright.asymmetricTailedSerifless",
		];
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-Upper-N",
			glyphIsNeeded: id => names.includes(id),
		});
		const rightWidth = name => {
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
			const y = para.xHeight * 0.3;
			const intersections = [];
			for (const contour of contours) for (const arc of contour) {
				let prev = glyph.gizmo.unapply(arc.eval(0));
				for (let i = 1; i <= 64; i++) {
					const next = glyph.gizmo.unapply(arc.eval(i / 64));
					if ((prev.y <= y && next.y > y) || (next.y <= y && prev.y > y)) {
						intersections.push(prev.x + (next.x - prev.x) * (y - prev.y) / (next.y - prev.y));
					}
					prev = next;
				}
			}
			intersections.sort((a, b) => a - b);
			assert.ok(intersections.length >= 4, `${slope} ${weight} ${name}: isolated right stem`);
			return intersections.at(-1) - intersections.at(-2);
		};
		for (const [standard, asymmetric] of [[names[0], names[1]], [names[2], names[3]]]) {
			const actual = rightWidth(standard);
			const expected = rightWidth(asymmetric);
			assert.ok(Math.abs(actual - expected) < 0.1, `${slope} ${weight} ${standard}: ${actual} vs ${expected}`);
		}
	}
});

test("asymmetric tsan mirrors asymmetric small-cap N horizontally", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir });
	const para = makePara({
		shape: { serifs: "sans", spacing: "normal", weight: 400, width: 500, slope: "upright", slopeAngle: 0 },
		menu: { family: "Tsan mirror test", version: "34.9.0", width: 5, slope: "upright", weight: 400 },
		featureControl: { noCvSs: true, noLigation: true },
	});
	const names = ["smcpN.asymmetricSerifless", "grek/tsan.asymmetricSerifless"];
	const { glyphStore } = buildGlyphs(para, {
		blockIsNeeded: id => id === "Letter-Latin-Upper-N",
		glyphIsNeeded: id => names.includes(id),
	});
	const points = (name, flip) => {
		const glyph = glyphStore.queryByNameEnsured(name);
		const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		return new Set(contours.flat().map(point => `${Math.round(flip ? para.width - point.x : point.x)},${Math.round(point.y)}`));
	};
	assert.deepEqual(points(names[0], true), points(names[1], false));
});
