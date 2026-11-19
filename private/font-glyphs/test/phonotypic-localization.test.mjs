import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { Point } from "@iosevka/geometry/point";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";
import {
	AnyLocalizedForm,
	Dotless,
	LocalizedForm,
} from "@iosevka/glyph/relation";
import * as Caching from "@iosevka/geometry-cache";
import { buildOtl } from "@iosevka/font-otl";
import { buildFont } from "../../../packages/font/src/build-font/index.mjs";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = (name) =>
	Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variants = read("variants");
const primes = Variant.parse(variants).primes;
const cases = [
	["d", "d", "latn/de.phonotypic"],
	["cyrl-capital-i", "cyrl/I", "Eng.phonotypic"],
	["capital-v", "V", "Ramshorn.phonotypic"],
	["v", "v", "ramshorn.phonotypic"],
	["capital-e", "E", "Schwa.phonotypic"],
	["capital-u", "U", "UBar.phonotypic"],
	["capital-u", "U", "turnmCap.phonotypic"],
	["u", "u", "uBar.phonotypic"],
	["t", "t", "latn/the.phonotypic"],
	["lower-theta", "grek/theta", "grek/theta.phonotypic"],
	["capital-j", "J/noDescend", "latn/iota.phonotypic/dotless"],
	["capital-i", "I", "latn/Iota.phonotypic"],
	["u", "uHookLeft", "uHookLeft.phonotypic"],
	["u", "uu", "reversedTurnmCap.phonotypic"],
	["capital-sigma", "grek/Sigma", "smcpEzh.phonotypic"],
];
const localized = [
	[0x018c, "latn/de.phonotypic"],
	[0x1df79, "latn/the.phonotypic"],
	[0x014a, "Eng.phonotypic"],
	[0xa7cb, "Ramshorn.phonotypic"],
	[0x0264, "ramshorn.phonotypic"],
	[0x018f, "Schwa.phonotypic"],
	[0x01b7, "Ezh.phonotypic"],
	[0x0244, "UBar.phonotypic"],
	[0x0289, "uBar.phonotypic"],
	[0x0220, "NLongLeg.phonotypic"],
	[0x1e9f, "latn/delta.phonotypic"],
	[0x2c70, "turnAScript.phonotypic"],
	[0x0252, "turnaScript.phonotypic"],
	[0x03b8, "grek/theta.phonotypic"],
	[0x01ae, "TRTail.phonotypic"],
	[0x0269, "latn/iota.phonotypic"],
	[0x0196, "latn/Iota.phonotypic"],
	[0xab52, "uHookLeft.phonotypic"],
	[0xa7fa, "smcpTurnmCap.phonotypic"],
	[0x1d23, "smcpEzh.phonotypic"],
	[0x1d15, "smcpOU.phonotypic"],
	[0x019c, "turnmCap.phonotypic"],
	[0xa79a, "AeVolapuk.phonotypic"],
	[0xa79b, "aeVolapuk.phonotypic"],
	[0xa79c, "OeVolapuk.phonotypic"],
	[0xa79d, "oeVolapuk.phonotypic"],
	[0xa79e, "UeVolapuk.phonotypic"],
	[0xa79f, "ueVolapuk.phonotypic"],
];
const localizedFeatureTags = [
	"LSRB",
	"LMKD",
	"LBOS",
	"LBGR",
	"LBSH",
	"LCHU",
	"LNSM",
	"LISM",
	"LLSM",
	"LSJE",
	"LSJU",
	"LSKS",
	"LSSM",
	"LPLK",
	"LROM",
	"LMOL",
	"LTRK",
	"LAZE",
	"LCRT",
	"LGAG",
	"LJCT",
	"LKAZ",
	"LKJJ",
	"LKMZ",
	"LTAT",
	"LTLY",
	"LUDI",
	"LZZA",
	"LVIT",
	"IPPH",
	"APPH",
	"UPPH",
	"PTMN",
];

function signedArea(contour) {
	return (
		contour.reduce((area, point, index) => {
			const next = contour[(index + 1) % contour.length];
			return area + point.x * next.y - next.x * point.y;
		}, 0) / 2
	);
}

function horizontalCrossings(glyph, y) {
	const contours = new Geom.SimplifyGeometry(
		glyph.geometry,
		glyph.gizmo,
		true,
	).toBezArcs();
	const crossings = [];
	for (const contour of contours) {
		for (const arc of contour) {
			let a = glyph.gizmo.unapply(arc.eval(0));
			for (let i = 1; i <= 48; i++) {
				const b = glyph.gizmo.unapply(arc.eval(i / 48));
				if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
					crossings.push(a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y));
				}
				a = b;
			}
		}
	}
	return crossings.sort((a, b) => a - b);
}

await Geom.Init();

for (const [spacing, slope, weight] of ["term", "quasi-proportional"].flatMap(
	(spacing) =>
		["upright", "italic"].flatMap((slope) =>
			[120, 420, 920].map((weight) => [spacing, slope, weight]),
		),
)) {
	test(`PTMN theta and T contours in ${spacing} ${weight} ${slope}`, () => {
		const argv = {
			shape: {
				serifs: "sans",
				spacing,
				weight,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: false, noLigation: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const angle = (para.slopeAngle * Math.PI) / 180;
		const horizontalStroke =
			para.stroke *
			(para.contrast * Math.cos(angle) +
				Math.sin(angle) * Math.tan(angle));
		for (const suffix of ["capsule", "oval", "diamond", "cursive"]) {
			const name = `grek/theta.phonotypic.${suffix}`;
			const glyph = glyphStore.queryByNameEnsured(name);
			const contours = new Geom.SimplifyGeometry(
				glyph.geometry,
				glyph.gizmo,
				true,
			)
				.toContours()
				.map((contour) =>
					contour.map((point) => glyph.gizmo.unapply(point)),
				);
			assert.equal(contours.length, 3, name);
			const minY = (contour) =>
				Math.min(...contour.map((point) => point.y));
			const lower = contours
				.slice(1)
				.sort((a, b) => minY(a) - minY(b))[0];
			const minX = (contour) =>
				Math.min(...contour.map((point) => point.x));
			assert.ok(
				Math.abs(minY(lower) - para.stroke) < 2,
				`${name}: bottom stroke`,
			);
			assert.ok(
				Math.abs(minX(lower) - minX(contours[0]) - horizontalStroke) <
					2,
				`${name}: side stroke`,
			);
			const arcSideY =
				para.ascender * (suffix === "capsule" ? 0.18 : 0.24);
			assert.ok(
				lower.some(
					(point) =>
						Math.abs(point.x - minX(lower)) < 2 &&
						Math.abs(point.y - arcSideY) < 4,
				),
				`${name}: lower arc tangent`,
			);
		}
		for (const t of [
			"serifless",
			"motionSerifed",
			"serifed",
			"baseSerifed",
		]) {
			const expected = glyphStore.queryByNameEnsured(
				`T.${t}`,
			).advanceWidth;
			for (const hook of ["bentHook", "flatHook", "cornerHook"]) {
				const name = `TRTail.phonotypic.${t}.${hook}Serifless`;
				const glyph = glyphStore.queryByNameEnsured(name);
				assert.equal(glyph.advanceWidth, expected, name);
				const contours = new Geom.SimplifyGeometry(
					glyph.geometry,
					glyph.gizmo,
					true,
				).toContours();
				assert.equal(contours.length, 1, name);
				assert.ok(
					Math.min(...contours[0].map((point) => point.y)) >= 0,
					name,
				);
				assert.ok(
					Math.max(
						...contours[0]
							.filter((point) => point.y < 0.6 * para.cap)
							.map((point) => point.x),
					) <= expected,
					name,
				);
				if (t === "serifless" && hook === "cornerHook") {
					const crossings = horizontalCrossings(glyph, 1.25 * para.stroke);
					assert.equal(crossings.length, 4, `${name}: corner counter`);
					assert.ok(
						crossings[2] - crossings[1] > 0.15 * para.stroke,
						`${name}: corner hook crowds the stem`,
					);
				}
				if (t === "serifless" && hook === "bentHook") {
					const tail = contours[0]
						.filter((point) => point.y < 0.35 * para.cap)
						.map((point) => glyph.gizmo.unapply(point));
					assert.ok(
						Math.max(...tail.map((point) => point.x)) -
							Math.min(...tail.map((point) => point.x)) >
							0.53 * expected,
						name,
					);
				}
			}
		}
		if (slope === "italic") {
			const flat = glyphStore.queryByNameEnsured("J.flatHookSerifless");
			const corner = glyphStore.queryByNameEnsured("J.cornerHookSerifless");
			const y = 0.5 * para.stroke;
			const flatLeft = horizontalCrossings(flat, y)[0];
			const cornerLeft = horizontalCrossings(corner, y)[0];
			assert.ok(
				flatLeft - cornerLeft > 0.025 * corner.advanceWidth,
				`italic J corner terminal must extend left: flat ${flatLeft}, corner ${cornerLeft}, width ${corner.advanceWidth}, stroke ${para.stroke}`,
			);
		}
		if (spacing === "quasi-proportional") {
			for (const hook of ["flatHook", "cornerHook"]) {
				const j = glyphStore.queryByNameEnsured(`J.${hook}Serifless`);
				const t = glyphStore.queryByNameEnsured(
					`TRTail.phonotypic.serifless.${hook}Serifless`,
				);
				const jStem = horizontalCrossings(j, 0.55 * para.cap);
				const tStem = horizontalCrossings(t, 0.55 * para.cap);
				const scale =
					(tStem.at(-1) - tStem[0]) / (jStem.at(-1) - jStem[0]);
				const offset = tStem[0] + scale * jStem.at(-1);
				if (hook === "cornerHook") {
					const flat = glyphStore.queryByNameEnsured("J.flatHookSerifless");
					const y = 0.5 * para.stroke;
					const jTail = horizontalCrossings(flat, y);
					const tTail = horizontalCrossings(t, y);
					assert.ok(
						tTail.at(-1) - (offset - scale * jTail[0]) >
							0.03 * scale * j.advanceWidth,
						"corner-hook terminal must be shifted outward",
					);
					continue;
				}
				for (const fraction of [0.05, 0.1, 0.2, 0.3, 0.4]) {
					const expected = horizontalCrossings(j, fraction * para.cap)
						.reverse()
						.map((x) => offset - scale * x);
					const actual = horizontalCrossings(t, fraction * para.cap);
					assert.equal(actual.length, expected.length, `${hook} at ${fraction}`);
					for (let i = 0; i < actual.length; i++) {
						assert.ok(
							Math.abs(actual[i] - expected[i]) < 0.25,
							`${hook} at ${fraction}: J-hook profile changed`,
						);
					}
				}
			}
		}
	});
}

test("narrow PTMN corner hooks fit their advance", () => {
	for (const [weight, slope] of [
		[120, "upright"],
		[920, "upright"],
		[920, "italic"],
	]) {
		const argv = {
			shape: {
				serifs: "sans",
				spacing: "term",
				weight,
				width: 350,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			featureControl: { noCvSs: false, noLigation: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: () => true,
			glyphIsNeeded: () => true,
		});
		const glyph = glyphStore.queryByNameEnsured(
			"TRTail.phonotypic.serifless.cornerHookSerifless",
		);
		const contours = new Geom.SimplifyGeometry(
			glyph.geometry,
			glyph.gizmo,
			true,
		).toContours();
		assert.equal(contours.length, 1, `${weight} ${slope}`);
		const tail = contours[0].filter((point) => point.y < 0.6 * para.cap);
		assert.ok(
			Math.max(...tail.map((point) => point.x)) <= glyph.advanceWidth,
			`${weight} ${slope}: corner hook exceeds advance`,
		);
	}
});

test("PTMN monospace T hooks retain proportional outlines when fitted", () => {
	const stores = new Map();
	for (const spacing of ["term", "quasi-proportional"]) {
		const argv = {
			shape: {
				serifs: "sans",
				spacing,
				weight: 420,
				width: 500,
				slope: "upright",
				slopeAngle: 0,
			},
			featureControl: { noCvSs: false, noLigation: true },
			variants: {
				design: {
					"capital-latin-gamma": "serifless",
					"latin-gamma": "serifless",
				},
			},
		};
		const para = init(data, argv);
		Variant.apply(variants, para, argv);
		stores.set(
			spacing,
			buildGlyphs(para, {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			}).glyphStore,
		);
	}
	for (const hook of ["bentHook", "flatHook", "cornerHook"]) {
		const name = `TRTail.phonotypic.serifed.${hook}Serifless`;
		const bounds = (spacing, predicate) => {
			const glyph = stores.get(spacing).queryByNameEnsured(name);
			const contours = new Geom.SimplifyGeometry(
				glyph.geometry,
				glyph.gizmo,
				true,
			).toContours();
			const points = contours
				.flat()
				.filter(predicate)
				.map((point) => glyph.gizmo.unapply(point));
			return [
				Math.min(...points.map((point) => point.x)) /
					glyph.advanceWidth,
				Math.max(...points.map((point) => point.x)) /
					glyph.advanceWidth,
			];
		};
		for (const predicate of [
			(point) => point.y < 250,
			(point) => point.y > 500,
		]) {
			const mono = bounds("term", predicate);
			const proportional = bounds("quasi-proportional", predicate);
			for (let i = 0; i < 2; i++)
				assert.ok(Math.abs(mono[i] - proportional[i]) < 0.01, name);
		}
	}
});

for (const slope of ["upright", "italic"]) {
	for (const weight of [120, 420, 920]) {
		test(`phonotypic glyph variants resolve with finite outlines at ${weight} ${slope}`, async () => {
			const argv = {
				shape: {
					serifs: "sans",
					spacing: "term",
					weight,
					width: 500,
					slope,
					slopeAngle: slope === "italic" ? 9.4 : 0,
				},
				featureControl: { noCvSs: false, noLigation: true },
				variants: {
					design: {
						"capital-latin-gamma": "serifless",
						"latin-gamma": "serifless",
					},
				},
			};
			const para = init(data, argv);
			Variant.apply(variants, para, argv);
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: () => true,
				glyphIsNeeded: () => true,
			});
			if (weight === 420 && slope === "upright") {
				const makePara = await getParametersT({ paramsDir });
				const otlPara = makePara({
					shape: {
						serifs: "sans",
						spacing: "term",
						weight,
						width: 500,
						slope,
						slopeAngle: 0,
					},
					menu: {
						family: "Phonotypic Test",
						version: "34.9.0",
						width: 5,
						slope,
						weight: 400,
					},
					featureControl: { noCvSs: false, noLigation: true },
					variants: {
						design: {
							"capital-latin-gamma": "serifless",
							"latin-gamma": "serifless",
						},
					},
				});
				const { glyphStore: otlGlyphStore } = buildGlyphs(otlPara);
				const { GSUB } = buildOtl(otlPara, otlGlyphStore);
				const features = new Map(
					Object.entries(GSUB.features).map(([name, feature]) => [
						feature.tag,
						{ name, feature },
					]),
				);
				for (const tag of localizedFeatureTags) {
					const entry = features.get(tag);
					assert.ok(entry, tag);
					assert.equal(tag.length, 4, tag);
					assert.ok(entry.feature.lookups.length, tag);
					for (const scriptTag of ["latn", "cyrl", "grek"]) {
						assert.ok(
							GSUB.languages[
								`${scriptTag}_DFLT`
							].features.includes(entry.name),
							`${scriptTag} ${tag}`,
						);
					}
				}
				for (const [tag, languageTag] of [
					["LSRB", "cyrl_SRB "],
					["LMKD", "cyrl_MKD "],
					["PTMN", "latn_PTMN"],
				]) {
					const language = GSUB.languages[languageTag];
					const loclName = language.features.find(
						(name) => GSUB.features[name].tag === "locl",
					);
					assert.ok(loclName, languageTag);
					assert.deepEqual(
						features.get(tag).feature.lookups,
						GSUB.features[loclName].lookups,
						tag,
					);
				}
			}
			for (const [cp, target] of localized) {
				const source = glyphStore.queryByUnicode(cp);
				assert.ok(source, cp.toString(16));
				assert.equal(LocalizedForm.PTMN.get(source), target);
				assert.ok(
					AnyLocalizedForm.query(source).includes(LocalizedForm.PTMN),
				);
				assert.ok(glyphStore.queryByName(target), target);
			}
			for (const [originalName, reversedName] of [
				["turnmCap", "reversedTurnmCap.phonotypic"],
				["turnm", "smcpTurnmCap.phonotypic"],
			]) {
				const original = glyphStore.queryByNameEnsured(originalName);
				const reversed = glyphStore.queryByNameEnsured(reversedName);
				const contoursOf = (glyph) =>
					new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true)
						.toContours()
						.map((contour) => contour.map((point) => glyph.gizmo.unapply(point)));
				const a = contoursOf(original);
				const b = contoursOf(reversed);
				const largest = (contours) => contours.map(signedArea).sort((x, y) => Math.abs(y) - Math.abs(x))[0];
				assert.equal(Math.sign(largest(a)), Math.sign(largest(b)), reversedName);
				assert.ok(
					Math.abs(Math.abs(largest(a)) - Math.abs(largest(b))) < Math.max(100, 0.01 * Math.abs(largest(a))),
					`${reversedName} ${slope} ${weight}: ${largest(a)} vs ${largest(b)}`,
				);
				assert.equal(original.advanceWidth, reversed.advanceWidth, reversedName);
			}
			const dottedIota = glyphStore.queryByNameEnsured(
				"latn/iota.phonotypic",
			);
			const dotlessIota = glyphStore.queryByNameEnsured(
				Dotless.get(dottedIota),
			);
			assert.equal(
				Dotless.get(dottedIota),
				"latn/iota.phonotypic/dotless",
			);
			const contours = new Geom.SimplifyGeometry(
				dottedIota.geometry,
				dottedIota.gizmo,
				true,
			).toContours();
			assert.equal(contours.length, 2);
			const attach = dotlessIota.gizmo.unapply(
				dotlessIota.baseAnchors.jTopSerifAttach,
			);
			const above = dotlessIota.gizmo.unapply(
				dotlessIota.baseAnchors.above,
			);
			assert.ok(
				Math.abs(above.x - (dotlessIota.advanceWidth - attach.x)) <
					0.01,
			);
			for (const name of [
				"latn/delta.phonotypic",
				"turnAScript.phonotypic",
				"turnaScript.phonotypic",
			]) {
				const glyph = glyphStore.queryByNameEnsured(name);
				const contours = new Geom.SimplifyGeometry(
					glyph.geometry,
					glyph.gizmo,
					true,
				).toContours();
				assert.equal(contours.length, 2, name);
				if (name !== "latn/delta.phonotypic") {
					assert.ok(
						Math.min(...contours.flat().map((point) => point.y)) >=
							0,
						name,
					);
				}
			}
			const alphaSuffixes = new Set(
				[...primes.get("a").variants.values()].map(
					(v) => v.selector["a/singleStorey.sans"],
				),
			);
			for (const suffix of alphaSuffixes) {
				for (const prefix of [
					"turnAScript.phonotypic",
					"turnaScript.phonotypic",
				]) {
					const name = `${prefix}.${suffix}`;
					const glyph = glyphStore.queryByNameEnsured(name);
					const contours = new Geom.SimplifyGeometry(
						glyph.geometry,
						glyph.gizmo,
						true,
					).toContours();
					assert.equal(contours.length, 2, name);
					assert.ok(
						Math.min(...contours.flat().map((point) => point.y)) >=
							0,
						name,
					);
					for (const point of contours.flat())
						assert.ok(
							Number.isFinite(point.x) &&
								Number.isFinite(point.y),
							name,
						);
				}
			}
			for (const prefix of [
				"turnAScript.phonotypic",
				"turnaScript.phonotypic",
			]) {
				const sharpBowl = glyphStore.queryByNameEnsured(
					`${prefix}.singleStoreySerifless`,
				);
				const points = new Geom.SimplifyGeometry(
					sharpBowl.geometry,
					sharpBowl.gizmo,
					true,
				)
					.toBezArcs()
					.flatMap((contour) =>
						contour.flatMap((arc) =>
							Array.from({ length: 32 }, (_, i) =>
								sharpBowl.gizmo.unapply(arc.eval(i / 32)),
							),
						),
					);
				const rightmost = points.reduce((a, b) => (a.x > b.x ? a : b));
				const top = prefix === "turnAScript.phonotypic" ? para.cap : para.xHeight;
				assert.ok(
					rightmost.y > 0.62 * top && rightmost.y < 0.76 * top,
					`${prefix}: sharp bowl should turn above mid-height`,
				);
				const outlines = (suffix) => {
					const glyph = glyphStore.queryByNameEnsured(
						`${prefix}.${suffix}`,
					);
					return new Geom.SimplifyGeometry(
						glyph.geometry,
						glyph.gizmo,
						true,
					).toContours();
				};
				const toothed = outlines("singleStoreySerifless");
				assert.deepEqual(
					outlines("singleStoreyEarlessCornerSerifless"),
					toothed,
				);
				assert.deepEqual(
					outlines("singleStoreyEarlessRoundedSerifless"),
					toothed,
				);
			}
			const turnedM = glyphStore.queryByNameEnsured(
				"turnmCap.phonotypic",
			);
			const mContours = new Geom.SimplifyGeometry(
				turnedM.geometry,
				turnedM.gizmo,
				true,
			).toContours();
			assert.ok(
				mContours
					.flat()
					.map((point) => turnedM.gizmo.unapply(point))
					.some(
						(point) =>
							Math.abs(point.y - para.cap) < 1 &&
							Math.abs(point.x - turnedM.advanceWidth / 2) <
								para.stroke,
					),
				"turned M middle stem reaches cap height",
			);
			for (const t of [
				"serifless",
				"motionSerifed",
				"serifed",
				"baseSerifed",
			]) {
				for (const hook of ["bentHook", "flatHook", "cornerHook"]) {
					const name = `TRTail.phonotypic.${t}.${hook}Serifless`;
					const glyph = glyphStore.queryByNameEnsured(name);
					const contours = new Geom.SimplifyGeometry(
						glyph.geometry,
						glyph.gizmo,
						true,
					).toContours();
					assert.equal(contours.length, 1, name);
					assert.ok(
						Math.min(...contours[0].map((point) => point.y)) >= 0,
						name,
					);
					const tail = contours[0].filter(
						(point) => point.y < 0.6 * para.cap,
					);
					assert.ok(
						Math.max(...tail.map((point) => point.x)) <=
							glyph.advanceWidth,
						name,
					);
					for (let i = 0; i < contours[0].length; i++) {
						const point = contours[0][i];
						if (
							point.type !== Point.Type.Corner ||
							point.y <= 0.4 * para.cap ||
							point.y >=
								Math.min(
									0.7 * para.cap,
									para.cap - 1.8 * para.stroke,
								)
						)
							continue;
						let back = 1;
						let forward = 1;
						while (
							back < contours[0].length - 1 &&
							Math.hypot(
								contours[0][(i + contours[0].length - back) % contours[0].length].x - point.x,
								contours[0][(i + contours[0].length - back) % contours[0].length].y - point.y,
							) < 6
						)
							back++;
						while (
							forward < contours[0].length - 1 &&
							Math.hypot(
								contours[0][(i + forward) % contours[0].length].x - point.x,
								contours[0][(i + forward) % contours[0].length].y - point.y,
							) < 6
						)
							forward++;
						const previous = contours[0][(i + contours[0].length - back) % contours[0].length];
						const next = contours[0][(i + forward) % contours[0].length];
						const ax = point.x - previous.x;
						const ay = point.y - previous.y;
						const bx = next.x - point.x;
						const by = next.y - point.y;
						const lengths = Math.hypot(ax, ay) * Math.hypot(bx, by);
						assert.ok(
							lengths > 0 &&
								(ax * bx + ay * by) / lengths >
									Math.cos(Math.PI / 12),
							`${name} at ${point.x}, ${point.y}: ${(ax * bx + ay * by) / lengths}`,
						);
					}
				}
			}
			for (const [prime, selector, name] of cases) {
				const suffixes = new Set(
					[...primes.get(prime).variants.values()].map(
						(v) => v.selector[selector],
					),
				);
				for (const suffix of suffixes) {
					const id = `${name}.${suffix}`;
					const glyph = glyphStore.queryByNameEnsured(id);
					const contours = new Geom.SimplifyGeometry(
						glyph.geometry,
						glyph.gizmo,
						true,
					).toContours();
					assert.ok(contours.length, id);
					if (name === "latn/de.phonotypic") {
						assert.equal(contours.length, 3, id);
						if (slope === "italic") {
							const holes = contours
								.filter((contour) => signedArea(contour) > 0)
								.sort(
									(a, b) =>
										Math.max(...a.map((p) => p.y)) -
										Math.max(...b.map((p) => p.y)),
								);
							assert.equal(holes.length, 2, id);
							assert.ok(
								Math.max(...holes[0].map((p) => p.y)) <
									para.xHeight,
								id,
							);
							const triangleBottom = Math.min(
								...holes[1].map((p) => p.y),
							);
							assert.ok(
								triangleBottom >= para.xHeight &&
									triangleBottom <= 1.15 * para.xHeight,
								id,
							);
							const outer = contours[0];
							const topIndex = outer.findIndex((point, index) => {
								const previous =
									outer[
										(index + outer.length - 1) %
											outer.length
									];
								return (
									point.type === Point.Type.Corner &&
									Math.abs(point.y - para.ascender) < 1 &&
									previous.type === Point.Type.Corner &&
									Math.abs(previous.y - para.xHeight) < 1
								);
							});
							assert.ok(topIndex >= 0, id);
							const top = glyph.gizmo.unapply(outer[topIndex]);
							const join = glyph.gizmo.unapply(
								outer[
									(topIndex + outer.length - 1) % outer.length
								],
							);
							const base = holes[1]
								.filter(
									(point) =>
										Math.abs(point.y - triangleBottom) < 1,
								)
								.map((point) => glyph.gizmo.unapply(point))
								.sort((a, b) => a.x - b.x);
							assert.equal(base.length, 2, id);
							const edge =
								join.x +
								((top.x - join.x) * (base[0].y - join.y)) /
									(top.y - join.y);
							const diagonalWidth =
								((base[0].x - edge) * (top.y - join.y)) /
								Math.hypot(top.x - join.x, top.y - join.y);
							const stemWidth =
								glyph.gizmo.unapply(
									outer[(topIndex + 1) % outer.length],
								).x - top.x;
							assert.ok(
								diagonalWidth > 0.5 * stemWidth &&
									diagonalWidth < 0.72 * stemWidth,
								id,
							);
							for (const contour of [contours[0], holes[0]]) {
								for (let i = 0; i < contour.length; i++) {
									const point = contour[i];
									if (
										point.type !== Point.Type.Corner ||
										point.x >= para.width / 2 ||
										point.y <= 0.24 * para.xHeight ||
										point.y >= 0.47 * para.xHeight
									)
										continue;
									const previous =
										contour[
											(i + contour.length - 1) %
												contour.length
										];
									const next =
										contour[(i + 1) % contour.length];
									const ax = point.x - previous.x;
									const ay = point.y - previous.y;
									const bx = next.x - point.x;
									const by = next.y - point.y;
									const lengths =
										Math.hypot(ax, ay) * Math.hypot(bx, by);
									assert.ok(
										lengths > 0 &&
											(ax * bx + ay * by) / lengths >
												Math.cos(Math.PI / 12),
										id,
									);
								}
							}
							const tooth = [
								"toothlessCornerRTB",
								"toothlessCorner",
								"toothlessRounded",
								"flatBottom",
								"toothed",
								"tailed",
							].find((value) => suffix.startsWith(value));
							assert.ok(tooth, id);
							const reference = glyphStore.queryByNameEnsured(
								`${name}.${tooth}Serifless`,
							);
							assert.deepEqual(
								contours,
								new Geom.SimplifyGeometry(
									reference.geometry,
									reference.gizmo,
									true,
								).toContours(),
								id,
							);
						}
					}
					if (name === "latn/the.phonotypic") {
						assert.equal(contours.length, 2, id);
						assert.ok(
							signedArea(contours[0]) * signedArea(contours[1]) <
								0,
							id,
						);
						const xs = contours[1].map((point) => point.x);
						const ys = contours[1].map((point) => point.y);
						assert.ok(Math.max(...xs) - Math.min(...xs) >= 20, id);
						assert.ok(Math.max(...ys) - Math.min(...ys) >= 20, id);
						if (suffix.startsWith("narrowBentHook")) {
							assert.ok(
								Math.min(
									...contours[0].map((point) => point.y),
								) < 0,
								id,
							);
						}
					}
					if (name === "Eng.phonotypic")
						assert.equal(contours.length, 1, id);
					if (
						name === "Ramshorn.phonotypic" ||
						name === "ramshorn.phonotypic"
					) {
						assert.equal(contours.length, 2, id);
					}
					if (name === "grek/theta.phonotypic")
						assert.equal(contours.length, 3, id);
					if (name === "latn/iota.phonotypic/dotless") {
						assert.ok(
							Math.min(
								...contours.flat().map((point) => point.y),
							) >=
								para.overshoot - 1,
							id,
						);
					}
					for (const point of contours.flat()) {
						assert.ok(
							Number.isFinite(point.x) &&
								Number.isFinite(point.y),
							id,
						);
					}
				}
			}
		});
	}
}

test("PTMN delta keeps its dot at a fixed level and sizes it from the bowl stroke", async () => {
	const makePara = await getParametersT({ paramsDir });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 260, 420, 530, 920, 930]) for (const tittle of ["round", "square", "diamond", "hexagon"]) {
		let baselineLeft;
		for (const variation of ["default", "dotSize", "accentHeight", "accentWidth", "accentClearance", "ascender", "descender", "xHeight", "privateMetrics"]) {
			const para = makePara({
				shape: { serifs: "sans", spacing: variation === "privateMetrics" ? "term" : "quasi-proportional", weight, width: variation === "privateMetrics" ? 586 : 500, slope, slopeAngle: slope === "italic" ? 10 : 0 },
				menu: { family: "PTMN delta QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { tittle } },
				...(variation === "privateMetrics" ? {
					metricOverride: {
						xHeight: 518, cap: 693, ascender: 732, descender: -186, symbolMid: 305,
						sb: "blend(weight, [260, 82], [303, 80], [389, 77], [530, 72], [618, 70], [783, 64], [930, 60])",
						contrast: "blend(weight, [260, 1.044], [530, 1.093], [930, 1.102])",
						accentWidth: 215, accentClearance: 68, accentHeight: 186, accentStackOffset: 234,
						dotSize: "blend(weight, [260, 98], [303, 104], [389, 113], [530, 125], [618, 133], [783, 150], [930, 166])",
						archDepth: 192, smallArchDepth: 256,
					},
				} : {}),
			});
			if (variation === "dotSize") para.dotSize *= 1.7;
			if (variation === "accentHeight") para.accentHeight *= 0.6;
			if (variation === "accentWidth") para.accentWidth += 80;
			if (variation === "accentClearance") para.accentClearance += 200;
			if (variation === "ascender") para.ascender += 150;
			if (variation === "descender") para.descender -= 70;
			if (variation === "xHeight") para.xHeight += 80;
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Mark-Above", "Letter-Greek-Lower-Delta"].includes(id),
				glyphIsNeeded: id => /^(?:dotAbove|tittleAbove|latn\/delta\.phonotypic)(?:\.|$)/.test(id),
			});
			const glyph = glyphStore.queryByNameEnsured("latn/delta.phonotypic");
			const contours = new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours()
				.map(c => c.map(p => glyph.gizmo.unapply(p)));
			const id = `${slope} ${weight} ${tittle} ${variation}`;
			assert.equal(contours.length, 2, `${id}: detached dot or closed hook`);
			assert.ok(contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), id);
			const anchor = glyph.gizmo.unapply(glyph.baseAnchors.above);
			const centerY = para.xHeight + 140;
			const radius = 20 + 0.625 * para.stroke;
			assert.ok(Math.abs(anchor.y - centerY - radius) < 0.1, `${id}: dot top changed`);
			assert.ok(centerY - radius > para.xHeight - para.overshoot, `${id}: dot touches the bowl`);
			assert.ok(Math.max(...contours.flat().map(p => p.y)) <= centerY + radius + 1, `${id}: hook protrudes above the dot`);
			const left = [-0.5, 0, 0.5].map(level =>
				horizontalCrossings(glyph, centerY + level * radius + 0.321)[0] - anchor.x);
			assert.ok(left.every(x => Number.isFinite(x) && x < 0), `${id}: missing dot at expected level`);
			if (tittle === "round") {
				assert.ok(Math.abs(left[1] + radius) < 1, `${id}: dot is not centered or sized to the bowl stroke`);
			}
			const normalizedLeft = left.map(x => x / radius);
			if (baselineLeft === undefined) baselineLeft = normalizedLeft;
			for (let i = 0; i < left.length; i++) {
				assert.ok(Math.abs(normalizedLeft[i] - baselineLeft[i]) < 0.02, `${id}: dot outline changed`);
			}
		}
	}
});

test("PTMN hooks remain joined and reversed turned-M forms preserve winding", async () => {
	const makePara = await getParametersT({ paramsDir });
	for (const serifs of ["sans", "slab"]) for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs, spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "PTMN hooks QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Mark-Above", "Letter-Greek-Lower-Delta", "Letter-Latin-Upper-I", "Letter-Latin-Lower-M", "Letter-Latin-U"].includes(id),
			glyphIsNeeded: id => /^(?:dotAbove|tittleAbove|latn\/delta\.phonotypic|latn\/Iota\.phonotypic|turnm|turnmCap|smcpTurnmCap\.phonotypic|reversedTurnmCap\.phonotypic|uHookLeft\.phonotypic)(?:\.|$)/.test(id),
		});
		const contoursOf = name => {
			const g = glyphStore.queryByNameEnsured(name);
			return new Geom.SimplifyGeometry(g.geometry, g.gizmo, true).toContours().map(c => c.map(p => g.gizmo.unapply(p)));
		};
		const delta = contoursOf("latn/delta.phonotypic");
		assert.equal(delta.length, 2, `delta hook and tittle must be fused: ${serifs} ${slope} ${weight}`);
		const iota = glyphStore.queryByNameEnsured("latn/Iota.phonotypic");
		const crossings = horizontalCrossings(iota, 0.12 * para.cap);
		assert.ok(crossings.length >= 6, `double-tailed iota counters: ${serifs} ${slope} ${weight}`);
		for (const shape of ["toothed", "tailed", "flatBottom", "toothlessCorner", "toothlessRounded"]) {
			const name = `turnmCap.phonotypic.${shape}Serifless`;
			assert.equal(contoursOf(name).length, 1, `${name}: ${serifs} ${slope} ${weight}`);
		}
		if (serifs === "sans" && slope === "upright" && weight === 120) {
			const pairedU = glyphStore.queryByNameEnsured("turnmCap.phonotypic.toothlessRoundedSerifless");
			assert.equal(horizontalCrossings(pairedU, 0).length, 4, "paired U bowls must not have a baseline tooth between them");
			assert.equal(contoursOf("turnmCap.phonotypic.toothlessRoundedSerifless").length, 1, "paired U shapes must be joined");
		}
		for (const [source, target] of [["turnmCap", "reversedTurnmCap.phonotypic"], ["turnm", "smcpTurnmCap.phonotypic"]]) {
			const a = contoursOf(source);
			const b = contoursOf(target);
			const area = cs => cs.reduce((sum, c) => sum + signedArea(c), 0);
			assert.equal(Math.sign(area(a)), Math.sign(area(b)), target);
			assert.ok(Math.abs(area(a) - area(b)) < Math.max(100, 0.01 * Math.abs(area(a))), `${target} ${serifs} ${slope} ${weight}: ${area(a)} vs ${area(b)}`);
			const xBounds = cs => [Math.min(...cs.flat().map(p => p.x)), Math.max(...cs.flat().map(p => p.x))];
			const [aMin, aMax] = xBounds(a);
			const [bMin, bMax] = xBounds(b);
			const width = glyphStore.queryByNameEnsured(source).advanceWidth;
			assert.ok(Math.abs(bMin - (width - aMax)) < 1 && Math.abs(bMax - (width - aMin)) < 1, target);
		}
		const uContours = contoursOf("uHookLeft.phonotypic");
		assert.equal(uContours.length, 1, `joined u hooks: ${serifs} ${slope} ${weight}`);
		const u = uContours.flat();
		const uBottom = Math.min(...u.map(p => p.y));
		assert.ok(uBottom >= Math.min(0, para.overshoot) - 1, `retroflex baseline: ${serifs} ${slope} ${weight}: ${uBottom}`);
	}
});

test("subset fonts expose custom localization features and PTMN substitutions", async () => {
	const slope = "upright";
	const argv = {
		shape: {
			serifs: "sans",
			spacing: "term",
			weight: 420,
			width: 500,
			slope,
			slopeAngle: 0,
		},
		menu: {
			family: "Phonotypic Test",
			version: "34.9.0",
			width: 5,
			slope,
			weight: 400,
		},
		featureControl: {
			noCvSs: true,
			noLigation: true,
			exportGlyphNames: true,
		},
		variants: {
			design: {
				"capital-latin-gamma": "serifless",
				"latin-gamma": "serifless",
			},
		},
		subset: {
			include: {
				text: String.fromCodePoint(...localized.map(([cp]) => cp), 0xa7fd),
			},
		},
	};
	const makePara = await getParametersT({ paramsDir });
	const cache = await Caching.load(null, "34.9.0", "phonotypic-test");
	const { font, charMap } = await buildFont(makePara(argv), cache);
	const script = font.gsub.scripts.get("latn");
	const language = script.languages.get("PTMN");
	const feature = language.features.find((item) => item.tag === "locl");
	const mappings = new Map(
		feature.lookups.flatMap((lookup) =>
			[...lookup.mapping].map(([source, target]) => [
				source.name,
				target,
			]),
		),
	);
	for (const [cp, target] of [...localized, [0xa7fd, "reversedTurnmCap.phonotypic"]]) {
		assert.ok(
			mappings.has(
				`uni${cp.toString(16).toUpperCase().padStart(4, "0")}`,
			),
			target,
		);
		assert.ok(
			charMap.some(([name]) => name === target),
			target,
		);
	}
	assert.ok(
		!script.defaultLanguage.features.some((item) => item === feature),
	);
});
