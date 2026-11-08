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

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const readParams = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(
		readParams,
	),
);
const variantData = readParams("variants");
const arcs = ["Rounded", "Serifed", "InwardSerifed", "FlatHook", "CornerHook"];
const glyphs = ["C", "c", "S", "s", "cyrl/E", "cyrl/e", "cyrl/Ze", "cyrl/ze"];
const arcKeys = [
	"rounded",
	"serifed",
	"inward-serifed",
	"flat-hooked",
	"corner-hooked",
];
const primes = [
	"capital-c",
	"c",
	"capital-s",
	"s",
	"cyrl-capital-e",
	"cyrl-e",
	"cyrl-capital-ze",
	"cyrl-ze",
];
await Geom.Init();

test("independent arc stages preserve existing variants and character-variant ranks", () => {
	const baseline = structuredClone(variantData);
	for (const primeName of primes) {
		assert.ok(
			baseline.prime[primeName]["variants-extra-buildup"],
			`${primeName}: independent arc stages are missing`,
		);
		delete baseline.prime[primeName]["variants-extra-buildup"];
	}
	const before = Variant.parse(baseline, {}).primes;
	const after = Variant.parse(variantData, {}).primes;
	for (const primeName of primes) {
		const previous = before.get(primeName);
		const current = after.get(primeName);
		assert.equal(current.tag, previous.tag, primeName);
		const oldMax = Math.max(
			...[...previous.variants.values()].map((variant) => variant.rank),
		);
		for (const [key, variant] of previous.variants) {
			assert.deepEqual(
				current.variants.get(key),
				variant,
				`${primeName}.${key}: legacy variant changed`,
			);
		}
		const ranks = new Set();
		for (const variant of current.variants.values()) {
			assert.ok(
				!ranks.has(variant.rank),
				`${primeName}: duplicate rank ${variant.rank}`,
			);
			ranks.add(variant.rank);
		}
		const prefixes =
			primeName === "cyrl-ze"
				? ["", "tall-"]
				: ["cyrl-capital-e", "cyrl-e"].includes(primeName)
					? [
							"",
							"diagonal-crossbar-rising-",
							"diagonal-crossbar-falling-",
						]
					: [""];
		for (const prefix of prefixes)
			for (const [i, top] of arcKeys.entries())
				for (const [j, bottom] of arcKeys.entries()) {
					const key = `${prefix}top-${top}-bottom-${bottom}`;
					const variant = current.variants.get(key);
					assert.ok(variant, `${primeName}.${key}: missing choice`);
					assert.ok(
						variant.rank > oldMax,
						`${primeName}.${key}: legacy rank reused`,
					);
					const suffix = `${prefix === "tall-" ? "tallT" : "t"}op${arcs[i]}Bottom${arcs[j]}${prefix.startsWith("diagonal-crossbar") ? (prefix.includes("falling") ? "DiagonalCrossbarFalling" : "DiagonalCrossbar") : ""}`;
					assert.equal(
						variant.selector[glyphs[primes.indexOf(primeName)]],
						suffix,
						`${primeName}.${key}: incorrect body`,
					);
				}
	}
});

test("additional variant stages validate offsets, reserved ranks and collisions", () => {
	const config = (key, rankOffset = 100, reservedVariantRanks = []) => ({
		entry: "body",
		rankOffset,
		reservedVariantRanks,
		stages: { body: { [key]: { rank: 1, next: "END", keyAffix: key } } },
	});
	const parseWith = (extra) => {
		const cfg = JSON.parse(JSON.stringify(variantData));
		cfg.prime["capital-c"]["variants-extra-buildup"] = extra;
		return Variant.parse(cfg, {}).primes.get("capital-c");
	};
	assert.throws(() => parseWith(config("new", -1)), /rank offset/);
	assert.throws(() => parseWith(config("new", 1.5)), /rank offset/);
	assert.throws(
		() => parseWith(config("new", 100, [0])),
		/Reserved variant ranks/,
	);
	assert.throws(
		() => parseWith(config("new", 100, [101, 101])),
		/Duplicate reserved/,
	);
	assert.throws(() => parseWith(config("serifless")), /Duplicate variant/);
	assert.throws(() => parseWith(config("new", 0)), /Duplicate variant rank/);
	assert.equal(
		parseWith(config("new", 100, [101])).variants.get("new").rank,
		102,
	);
	const explicitReserved = config("new", 100, [101]);
	explicitReserved.stages.body.new.variantRank = 101;
	assert.throws(() => parseWith(explicitReserved), /rank 101 is reserved/);
});

for (const [weight, slope] of [
	[120, "upright"],
	[120, "italic"],
	[420, "upright"],
	[420, "italic"],
	[920, "upright"],
	[920, "italic"],
]) {
	test(`independent letter arc geometry at ${weight} ${slope}`, () => {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: false },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variantData, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		for (const glyphName of glyphs) {
			const reference = glyphStore.queryByNameEnsured(
				`${glyphName}.serifless`,
			);
			for (const [arc, legacy] of [
				["Rounded", "serifless"],
				["Serifed", "bilateralSerifed"],
				["InwardSerifed", "bilateralInwardSerifed"],
				["FlatHook", "flatHook"],
				["CornerHook", "cornerHook"],
			]) {
				assert.deepEqual(
					glyphStore
						.queryByNameEnsured(
							`${glyphName}.top${arc}Bottom${arc}`,
						)
						.geometry.toContours(),
					glyphStore
						.queryByNameEnsured(`${glyphName}.${legacy}`)
						.geometry.toContours(),
					`${glyphName}: matching ${arc} arcs must preserve the legacy outline`,
				);
			}
			for (const top of arcs)
				for (const bottom of arcs) {
					const name = `${glyphName}.top${top}Bottom${bottom}`;
					const glyph = glyphStore.queryByNameEnsured(name);
					const contours = glyph.geometry.toContours();
					assert.ok(contours.length, `${name}: empty`);
					assert.ok(
						contours.every(
							(c) =>
								c.length >= 3 &&
								c.every(
									(p) =>
										Number.isFinite(p.x) &&
										Number.isFinite(p.y),
								),
						),
						name,
					);
					assert.equal(
						glyph.advanceWidth,
						reference.advanceWidth,
						`${name}: advance width changed`,
					);
					const simplified = new Geom.SimplifyGeometry(
						glyph.geometry,
						glyph.gizmo,
						true,
					).toContours();
					const areas = simplified.map((contour) =>
						contour.reduce((area, p, i) => {
							const q = contour[(i + 1) % contour.length];
							return area + p.x * q.y - q.x * p.y;
						}, 0),
					);
					const outer = areas.reduce(
						(a, b) => (Math.abs(a) > Math.abs(b) ? a : b),
						0,
					);
					assert.notEqual(outer, 0, `${name}: missing outer contour`);
					assert.equal(
						areas.filter((area) => area * outer > 0).length,
						1,
						`${name}: disconnected component`,
					);
				}
		}
		for (const glyphName of [
			"cyrl/E",
			"cyrl/e",
			"cyrl/YeUkrainian",
			"cyrl/yeUkrainian",
		]) {
			for (const [arc, legacy] of [
				["FlatHook", "flatHook"],
				["CornerHook", "cornerHook"],
			]) {
				for (const bar of [
					"DiagonalCrossbar",
					"DiagonalCrossbarFalling",
				]) {
					assert.deepEqual(
						glyphStore
							.queryByNameEnsured(
								`${glyphName}.top${arc}Bottom${arc}${bar}`,
							)
							.geometry.toContours(),
						glyphStore
							.queryByNameEnsured(`${glyphName}.${legacy}${bar}`)
							.geometry.toContours(),
						`${glyphName}: matching ${arc} arcs must preserve the ${bar} outline`,
					);
				}
			}
		}
		const selectorShapes = {
			"capital-c": {
				C: "C",
				"C/sansSerif": "C",
				"C/descBase": "C/descBase",
				CHookTop: "CHookTop",
				OOpen: "revC",
				"C/topSerif": "cyrl/SjeKomi",
				"C/bottomSerif": "C",
			},
			c: {
				c: "c",
				"c/sansSerif": "c",
				"c/descBase": "c/descBase",
				cHookTop: "cHookTop",
				oOpen: "revc",
				"c/topSerif": "cyrl/sjeKomi",
				"c/bottomSerif": "c",
				cCurlyTail: "cCurlyTail",
				"oOpen/descBase": "revc",
			},
			"capital-s": {
				S: "S",
				"S/sansSerif": "S",
				SSwash: "SSwash",
				SRTail: "S",
			},
			s: {
				s: "s",
				"s/sansSerif": "s",
				sSwash: "sSwash",
				sRTail: "s",
				"s/phoneticRight": "s/phoneticRight",
				"tsLig/lowerHalf": "tsLig/lowerHalf",
				"s/ascBase": "s",
			},
			"cyrl-capital-e": {
				"cyrl/E": "cyrl/E",
				"cyrl/E/topSerif": "cyrl/E",
				"cyrl/YeUkrainian": "cyrl/YeUkrainian",
				"cyrl/YeUkrainian/topSerif": "cyrl/YeUkrainian",
				"currency/euroSign": "currency/euroSign",
			},
			"cyrl-e": {
				"cyrl/e": "cyrl/e",
				"cyrl/e/topSerif": "cyrl/e",
				"cyrl/yeUkrainian": "cyrl/yeUkrainian",
				"cyrl/yeUkrainian/topSerif": "cyrl/yeUkrainian",
			},
			"cyrl-capital-ze": {
				"cyrl/Ze": "cyrl/Ze",
				"cyrl/Ze/topSerif": "Yogh",
				"cyrl/revZe": "cyrl/revZe",
				"cyrl/Zhwe/Ze": "cyrl/Zhwe/left",
				"cyrl/Dzze/Ze": "cyrl/Dzze.standardSerifless",
				"latn/Epsilon": "cyrl/revZe",
				"latn/revEpsilon": "cyrl/Ze",
			},
			"cyrl-ze": {
				"cyrl/ze": "cyrl/ze",
				"cyrl/ze/topSerif": "yogh",
				"cyrl/ze.BGR": "cyrl/ze",
				"cyrl/revze": "cyrl/revze",
				"cyrl/zhwe/ze": "cyrl/zhwe/left",
				"cyrl/dzze.upright/ze": "cyrl/dzze.upright.standardSerifless",
				"cyrl/dzze.italic/ze": "cyrl/dzze.italic",
				"latn/epsilon": "cyrl/revze",
				"latn/epsilon/descBase": "cyrl/revze",
				"latn/revepsilon": "cyrl/ze",
				"latn/revepsilon/descBase": "cyrl/ze",
			},
		};
		for (const [primeName, selectors] of Object.entries(selectorShapes)) {
			const prime = para.variants.primes.get(primeName);
			for (const variant of prime.variants.values()) {
				if (
					!variant.key.includes("top-") ||
					!variant.key.includes("-bottom-")
				)
					continue;
				for (const [selector, shape] of Object.entries(selectors)) {
					const name = `${shape}.${variant.selector[selector]}`;
					assert.ok(
						glyphStore.queryByName(name),
						`${primeName}.${variant.key}: missing ${selector} shape ${name}`,
					);
				}
			}
		}
	});
}
