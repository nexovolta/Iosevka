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
	["u", "u", "uBar.phonotypic"],
	["t", "t", "latn/the.phonotypic"],
	["lower-theta", "grek/theta", "grek/theta.phonotypic"],
	["capital-j", "J/noDescend", "latn/iota.phonotypic/dotless"],
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
	});
}

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
						const previous =
							contours[0][
								(i + contours[0].length - 1) %
									contours[0].length
							];
						const next = contours[0][(i + 1) % contours[0].length];
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
				text: String.fromCodePoint(...localized.map(([cp]) => cp)),
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
	for (const [cp, target] of localized) {
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
