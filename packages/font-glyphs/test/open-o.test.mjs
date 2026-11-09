import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { getParametersT } from "../../font/src/param/index.mjs";

const paramsDir = fileURLToPath(new URL("../../../params/", import.meta.url));
const makePara = await getParametersT({ paramsDir });
const chars = Array.from("CcↃↄƆɔoɔøꬿ𝼛ᶗœꭢꝋ𝽂ᴐᴒᵓᶗ");

function points(glyph, transform = p => p) {
	return glyph.geometry.toBezArcs().flatMap(contour =>
		contour.flatMap(arc =>
			[0, 0.25, 0.5, 0.75].map(t => {
				const p = transform(arc.eval(t));
				return `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
			}),
		),
	).sort();
}

function assertTurned(source, target, height, label) {
	const expected = points(source, p => {
		const upright = source.gizmo.unapply(p);
		return source.gizmo.applyXY(source.advanceWidth - upright.x, height - upright.y);
	});
	assert.deepEqual(points(target), expected, label);
	assert.equal(target.advanceWidth, source.advanceWidth, `${label}: advance`);
}

function contours(glyph) {
	return new Geom.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toContours();
}

function svgPath(shape) {
	return shape.map(c => {
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

await Geom.Init();
for (const [weight, slope] of [[120, "upright"], [120, "italic"], [420, "upright"], [420, "italic"], [920, "upright"], [920, "italic"]]) {
	test(`open O at ${weight} ${slope}`, () => {
		const argv = {
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Open O QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		};
		const para = makePara(argv);
		const { glyphStore } = buildGlyphs(para);
		const byName = name => glyphStore.queryByNameEnsured(name);

		for (const [prime, src, dst, height] of [
			["capital-c", "C", "OOpen", para.cap],
			["capital-c", "smcpC", "smcpOOpen", para.xHeight],
			["c", "c", "oOpen", para.xHeight],
		]) {
			for (const [key, variant] of para.variants.primes.get(prime).variants) {
				const sourceName = variant.get(byName(src));
				const targetName = variant.get(byName(dst));
				assert.ok(sourceName && targetName, `${prime} ${key}: missing CV relation`);
				assertTurned(byName(sourceName), byName(targetName), height, `${prime} ${key} ${dst}`);
			}
			assertTurned(byName(src), byName(dst), height, `default ${dst}`);
		}

		for (const char of chars) {
			const glyph = glyphStore.queryByUnicode(char.codePointAt(0));
			assert.ok(glyph, `missing ${char}`);
			const shape = contours(glyph);
			assert.ok(shape.length, `empty ${char}`);
			for (const p of shape.flat()) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `invalid ${char}`);
		}

		if (process.env.OPEN_O_QA_DIR) {
			const proof = [`<text x="20" y="25">Open O QA: ${weight} ${slope}</text>`];
			const row = (label, glyphs, y) => {
				proof.push(`<text x="20" y="${y}">${label}</text>`);
				for (const [i, [name, glyph]] of glyphs.entries()) {
					const x = 170 + i * 95;
					proof.push(`<text x="${x}" y="${y - 6}">${name}</text>`);
					proof.push(`<path d="${svgPath(contours(glyph))}" transform="translate(${x} ${y + 85}) scale(.13 -.13)"/>`);
				}
			};
			row("Requested characters", chars.map(c => [c, glyphStore.queryByUnicode(c.codePointAt(0))]), 65);
			let index = 0;
			for (const [key, variant] of para.variants.primes.get("c").variants) {
				const glyphs = ["c", "revc", "oOpen", "oOpenSideways", "oOpenSlash", "oOpenRetroflexHook", "oeOpen", "oOpenBar"].map(name => {
					const base = byName(name);
					const alternate = variant.get(base);
					return [name, alternate ? byName(alternate) : base];
				});
				row(key, glyphs, 190 + index++ * 115);
			}
			writeFileSync(path.join(process.env.OPEN_O_QA_DIR, `open-o-${weight}-${slope}.svg`),
				`<svg xmlns="http://www.w3.org/2000/svg" width="2050" height="${260 + index * 115}" style="font:14px sans-serif"><rect width="100%" height="100%" fill="white"/><g fill="black">${proof.join("")}</g></svg>`);
		}
	});
}
