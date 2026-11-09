import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import * as Toml from "@iarna/toml";
import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { init } from "@iosevka/param";
import * as Variant from "@iosevka/param/variant";
import * as TypoGeom from "typo-geom";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign(
	{},
	...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read),
);
const variants = read("variants");

function svgPath(contours) {
	return contours
		.map(c => {
			assert.equal(c[0].type, 0);
			let d = `M${c[0].x},${c[0].y}`;
			for (let i = 1; i < c.length; i++) {
				const p = c[i],
					q = c[(i + 1) % c.length];
				if (p.type === 0) d += `L${p.x},${p.y}`;
				else if (p.type === 1 && q.type === 2) {
					const r = c[(i + 2) % c.length];
					assert.equal(r.type, 0);
					d += `C${p.x},${p.y} ${q.x},${q.y} ${r.x},${r.y}`;
					i += 2;
				} else if (p.type === 3 && q.type === 0) {
					d += `Q${p.x},${p.y} ${q.x},${q.y}`;
					i++;
				} else if (p.type === 3 && q.type === 3) {
					d += `Q${p.x},${p.y} ${(p.x + q.x) / 2},${(p.y + q.y) / 2}`;
				} else throw new Error(`Unexpected point type ${p.type}`);
			}
			return `${d}Z`;
		})
		.join("");
}

await Geom.Init();
for (const [weight, slope] of [
	[120, "upright"],
	[120, "italic"],
	[420, "upright"],
	[420, "italic"],
	[920, "upright"],
	[920, "italic"],
]) {
	const choices = [
		["straight-top-right-motion-serifed", "straight-serifless"],
		["curly-serifed", "curly-serifless"],
	];
	if (weight === 420)
		choices.push(
			["straight-serifed", "square-top-serifless"],
			["curly-top-right-motion-serifed", "straight-serifless"],
		);
	for (const [y, v] of choices) {
		test(`A digraph repairs at ${weight} ${slope} ${y}`, () => {
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
						"capital-a": "square-bottom-serifless",
						"capital-v": v,
						y,
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
			const contours = glyph =>
				new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
			const proof = [
				`<text x="15" y="24">A digraph repairs — ${weight} ${slope}, ${y}</text>`,
			];
			const rows = [
				[
					"AE square",
					[
						[0xc6, "capital-a", "square-bottom-serifless"],
						[0xc6, "capital-a", "square-bottom-top-serifed"],
						[0xc6, "capital-a", "square-bottom-top-serifed-diagonal-bar-falling"],
					],
				],
				["AV bar", [["AVBar"], ["AV"], ["avBar"], ["av"]]],
				["AY", [[0xa73d], [0xa73c], ["ay/yRight"], ["AY/Y"]]],
			];
			const labels = [
				["serifless", "top serifed", "falling bar"],
				["AV-bar", "AV", "av-bar", "av"],
				["ay", "AY", "ay Y component", "AY Y component"],
			];
			for (const [row, [label, choices]] of rows.entries()) {
				proof.push(`<text x="15" y="${row * 220 + 125}">${label}</text>`);
				for (const [col, [cp, prime, key]] of choices.entries()) {
					const base =
						typeof cp === "string"
							? glyphStore.queryByNameEnsured(cp)
							: glyphStore.queryByUnicode(cp);
					const variant = prime && para.variants.primes.get(prime).variants.get(key);
					if (prime) assert.ok(variant, key);
					const name = variant ? variant.get(base) : null;
					if (variant) assert.ok(name, `${cp} ${key}`);
					const shape = contours(variant ? glyphStore.queryByNameEnsured(name) : base);
					const exteriors = shape.filter(
						c =>
							c.reduce((sum, p, i) => {
								const q = c[(i + 1) % c.length];
								return sum + p.x * q.y - q.x * p.y;
							}, 0) < 0,
					);
					if (cp !== "AV" && cp !== "av")
						assert.equal(exteriors.length, 1, `${cp} ${key}: detached outline`);
					if (
						cp === 0xc6 &&
						key === "square-bottom-serifless" &&
						weight === 920 &&
						slope === "italic"
					) {
						const counter = shape.find(c => !exteriors.includes(c));
						assert.ok(counter, "Æ counter missing");
						assert.equal(
							counter.filter(p => p.type === 0 && Math.abs(p.y - para.cap / 2) <= 1)
								.length,
							1,
							"Æ diagonal join has a notch",
						);
					}
					proof.push(
						`<text x="${170 + col * 180}" y="${row * 220 + 65}">${labels[row][col]}</text>`,
					);
					proof.push(
						`<path d="${svgPath(shape)}" transform="translate(${170 + col * 180} ${row * 220 + 210}) scale(.17 -.17)"/>`,
					);
				}
			}
			const yBody = y.startsWith("straight") ? "straight" : "curly";
			const ySuffix = para.variants.primes
				.get("y")
				.variants.get(y)
				.resolveFor(para, "y/nonCursive");
			for (const [prefix, top] of [
				["ay/yRight", para.xHeight],
				["AY/Y", para.cap],
			]) {
				const serifedContours = contours(
					glyphStore.queryByNameEnsured(`${prefix}.${ySuffix}`),
				);
				const serifed = serifedContours.flat();
				const plain = contours(
					glyphStore.queryByNameEnsured(`${prefix}.${yBody}Serifless`),
				).flat();
				const topLeft = points =>
					Math.min(...points.filter(p => p.y >= top - 1).map(p => p.x));
				assert.ok(
					topLeft(serifed) < topLeft(plain) - 2,
					`${prefix}: inner top serif is missing`,
				);
				if (yBody === "straight") {
					for (const contour of serifedContours) {
						const points = contour.filter(p => p.type === 0);
						for (let i = 0; i < points.length; i++) {
							const p = points[i];
							if (
								p.y <= para.descender + 0.2 * (top - para.descender) ||
								p.y >= top - 0.25 * (top - para.descender)
							)
								continue;
							const before = points[(i + points.length - 1) % points.length];
							const after = points[(i + 1) % points.length];
							assert.ok(
								(p.y - before.y) * (after.y - p.y) >= 0,
								`${prefix}: Y leg reverses direction`,
							);
						}
					}
				}
			}
			for (const [bar, plain] of [
				["AVBar", "AV"],
				["avBar", "av"],
			]) {
				const added = new Geom.BooleanGeometry(TypoGeom.Boolean.ClipType.Difference, [
					glyphStore.queryByNameEnsured(bar).geometry,
					glyphStore.queryByNameEnsured(plain).geometry,
				]);
				const area = added.toBezArcs().reduce((sum, contour) => {
					const points = contour.flatMap(arc =>
						Array.from({ length: 16 }, (_, i) => arc.eval(i / 16)),
					);
					return (
						sum +
						Math.abs(
							points.reduce((area, p, i) => {
								const q = points[(i + 1) % points.length];
								return area + p.x * q.y - q.x * p.y;
							}, 0),
						) /
							2
					);
				}, 0);
				assert.ok(area > 1, `${bar}: missing crossbar`);
			}
			if (process.env.QA_PROOF_DIR) {
				writeFileSync(
					path.join(
						process.env.QA_PROOF_DIR,
						`a-digraph-repairs-${weight}-${slope}-${y}.svg`,
					),
					`<svg xmlns="http://www.w3.org/2000/svg" width="950" height="760"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="15">${proof.join("\n")}</g></svg>`,
				);
			}
		});
	}
}
