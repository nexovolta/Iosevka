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
import { getParametersT } from "../../font/src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const read = name => Toml.parse(readFileSync(path.join(paramsDir, `${name}.toml`), "utf8"));
const data = Object.assign({}, ...["parameters", "shape-weight", "shape-width", "shape-slope"].map(read));
const variantData = read("variants");
const hooks = ["serifless", "serifed", "inward-serifed", "flat-hooked", "corner-hooked"];
const digraphs = [0x26e, 0x2a4, 0x1df20, 0x1df12, 0xa728, 0xa729];
const makePara = await getParametersT({ paramsDir });
function svgPath(contours) {
	return contours.map(c => {
		assert.equal(c[0].type, 0);
		let d = `M${c[0].x},${c[0].y}`;
		for (let i = 1; i < c.length; i++) {
			const p = c[i], q = c[(i + 1) % c.length];
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
	}).join("");
}
function assertCornerHookDoesNotFold(contours, bottom, name) {
	let checked = 0;
	for (const contour of contours) {
		for (let i = 0; i < contour.length; i++) {
			const at = offset => contour[(i + offset + contour.length) % contour.length];
			const before = at(-1), outer = at(0), topLeft = at(1), topRight = at(2);
			if ([before, outer, topLeft, topRight].some(p => p.type !== 0)) continue;
			if (Math.abs(outer.y - bottom) > 1 || Math.abs(before.y - outer.y) > 1) continue;
			if (before.x <= outer.x + 2 || topLeft.y <= outer.y + 2) continue;
			if (Math.abs(topRight.y - topLeft.y) > 1 || topRight.x <= topLeft.x + 2) continue;
			const shear = (topLeft.x - outer.x) / (topLeft.y - outer.y);
			const innerX = topRight.x - shear * topRight.y;
			let lastY = topRight.y;
			for (let j = 3; j < contour.length; j++) {
				const point = at(j);
				if (point.x - shear * point.y > innerX + 2) {
					assert.ok(point.y >= lastY - 1, `${name}: corner-hook inner contour folds downward ${JSON.stringify({ topRight, point, lastY, shear })}`);
					checked++;
					break;
				}
				lastY = point.y;
			}
		}
	}
	assert.ok(checked, `${name}: corner-hook terminal not found`);
}
await Geom.Init();

for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`ezh digraph hook selectors at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Ezh Digraph QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false },
			variants: { design: { "lower-ezh": "straight-flat-hooked-serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = makePara(argv);
		const { glyphStore } = buildGlyphs(para);
		const byName = name => glyphStore.queryByNameEnsured(name);
		const outline = glyph => new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
		const prime = para.variants.primes.get("lower-ezh");
		const proof = [`<text x="15" y="24">Lower ezh hook variants — ${weight} ${slope}</text>`];
		for (const [col, cp] of digraphs.entries()) {
			proof.push(`<text x="${215 + col * 125}" y="48">U+${cp.toString(16).toUpperCase()}</text>`);
			const glyph = glyphStore.queryByUnicode(cp);
			assert.ok(glyph, `missing U+${cp.toString(16)}`);
			const shapes = hooks.map((hook, row) => {
				const name = prime.variants.get(`straight-${hook}-serifless`).get(glyph);
				assert.ok(name, `U+${cp.toString(16)}: missing ${hook}`);
				const contours = outline(byName(name));
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
				if (hook === "corner-hooked") {
					assertCornerHookDoesNotFold(contours, para.descender, name);
					assert.ok(contours.every(c => c.some(p => p.y >= 0)), `${name}: isolated contour below baseline`);
				}
				proof.push(`<path d="${svgPath(contours)}" transform="translate(${215 + col * 125} ${row * 135 + 160}) scale(.13 -.13)"/>`);
				return JSON.stringify(contours);
			});
			assert.equal(new Set(shapes).size, hooks.length, `U+${cp.toString(16)}: hook choices must differ`);
		}
		if (weight === 420 && slope === "upright") {
			for (const name of ["TZ/ezh.straightSerifless.cornerHook", "tz/ezh.straightSerifless.cornerHook"]) {
				const contours = outline(byName(name));
				const points = contours.flat();
				const width = Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x));
				const nose = Math.max(0, ...contours.flatMap(contour => contour.map((point, i) => {
					const next = contour[(i + 1) % contour.length];
					return point.type === 0 && next.type === 0 && Math.abs(point.y - next.y) < 1
						&& point.y > 0.2 * para.xHeight && point.y < 0.5 * para.xHeight
						? Math.abs(point.x - next.x) : 0;
				})));
				assert.ok(nose >= 0.2 * width, `${name}: ezh bend is too short (${nose} / ${width})`);
			}
		}
		if (process.env.QA_PROOF_DIR) {
			hooks.forEach((hook, row) => proof.push(`<text x="15" y="${row * 135 + 100}">${hook}</text>`));
			writeFileSync(path.join(process.env.QA_PROOF_DIR, `ezh-digraph-hooks-${weight}-${slope}.svg`),
				`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="13">${proof.join("\n")}</g></svg>`);
		}
		for (const name of ["lezh", "lezh/phoneticRight"]) {
			const original = byName(`${name}.straightSerifless.serifless`);
			const unchanged = byName(`${name}/hook.straightSerifless.serifless.serifless`);
			assert.deepEqual(outline(unchanged), outline(original), `${name}: default shape changed`);
			assert.equal(unchanged.advanceWidth, original.advanceWidth, `${name}: default component width changed`);
			assert.deepEqual(outline(byName(name)), outline(byName(`${name}/hook.straightSerifless.flatHook`)), `${name}: selected hook not applied`);
		}

		assert.deepEqual(outline(byName("ezh/phoneticRight")), outline(byName("ezh/phoneticRight.straightSerifless.flatHook")));
		for (const name of ["ezh", "lezh", "ezh/phoneticRight", "lezh/phoneticRight"]) {
			const glyph = byName(name);
			const shapes = hooks.map(hook => {
				const variantName = prime.variants.get(`straight-${hook}-serifless`).get(glyph);
				assert.ok(variantName, `${name}: missing ${hook}`);
				const contours = outline(byName(variantName));
				assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), variantName);
				return JSON.stringify(contours);
			});
			assert.equal(new Set(shapes).size, hooks.length, `${name}: hook choices must remain distinct`);
		}
		for (const cp of [0x292, 0xa763, 0x1df18]) {
			const glyph = glyphStore.queryByUnicode(cp);
			for (const body of ["straight", "cursive"]) for (const top of ["serifless", "top-serifed"]) {
				const shapes = hooks.map(hook => {
					const name = prime.variants.get(`${body}-${hook}-${top}`).get(glyph);
					assert.ok(name, `U+${cp.toString(16)}: missing ${body} ${hook} ${top}`);
					const contours = outline(byName(name));
					assert.ok(contours.length && contours.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), name);
					const exteriors = contours.filter(c => c.reduce((sum, p, i) => {
						const q = c[(i + 1) % c.length];
						return sum + p.x * q.y - q.x * p.y;
					}, 0) < 0);
					assert.equal(exteriors.length, 1, `${name}: detached contour`);
					return JSON.stringify(contours);
				});
				assert.equal(new Set(shapes).size, hooks.length, `U+${cp.toString(16)}: hook choices must differ`);
			}
		}
		for (const cp of [0x1ba, 0x1d9a, 0x1df05]) {
			const glyph = glyphStore.queryByUnicode(cp);
			const shapes = hooks.map(hook => {
				const name = prime.variants.get(`straight-${hook}-serifless`).get(glyph);
				return JSON.stringify(outline(name ? byName(name) : glyph));
			});
			assert.equal(new Set(shapes).size, 1, `U+${cp.toString(16)}: attached hook or loop must retain its rounded terminal`);
		}
		for (const cp of [0x292, 0x1ba, 0xa763, 0x26e, 0x1df05, 0x1d9a, 0x1df18]) {
			assert.ok(outline(glyphStore.queryByUnicode(cp)).length, `U+${cp.toString(16)}`);
		}
		for (const cp of [0x292, 0x1ba, 0x1d9a, 0x1df18, 0xa763]) {
			const glyph = glyphStore.queryByUnicode(cp);
			const shape = key => {
				const name = prime.variants.get(key).get(glyph);
				assert.ok(name, `U+${cp.toString(16)}: missing ${key}`);
				return JSON.stringify(outline(byName(name)));
			};
			const straight = shape("straight-serifless-serifless");
			const cursive = shape("cursive-serifless-serifless");
			const serifed = shape("straight-serifless-top-serifed");
			if (cp === 0xa763) {
				assert.equal(straight, cursive, "visigothic ezh must keep its own top");
				assert.equal(straight, serifed, "visigothic ezh must not inherit ezh top serifs");
			} else {
				assert.notEqual(straight, cursive, `U+${cp.toString(16)}: cursive top missing`);
				assert.notEqual(straight, serifed, `U+${cp.toString(16)}: top serif missing`);
			}
		}
	});
}

test("ezh hooks preserve independent z body and l top choices", () => {
	const argv = {
		shape: { serifs: "sans", spacing: "term", weight: 420, width: 500, slope: "upright", slopeAngle: 0 },
		featureControl: { noCvSs: false },
		variants: { design: { z: "cursive", l: "hooky", "lower-ezh": "straight-flat-hooked-serifless", "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
	};
	const para = init(data, argv);
	Variant.apply(variantData, para, argv);
	const { glyphStore } = buildGlyphs(para, { blockIsNeeded: () => true, glyphIsNeeded: () => true });
	const outline = name => {
		const glyph = glyphStore.queryByNameEnsured(name);
		return new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
	};
	assert.deepEqual(outline("ezh/phoneticRight"), outline("ezh/phoneticRight.cursive.flatHook"));
	for (const name of ["lezh", "lezh/phoneticRight"]) {
		assert.deepEqual(outline(name), outline(`${name}/hook.cursive.flatHook.hooky`));
	}
});
