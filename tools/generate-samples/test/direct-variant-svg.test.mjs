import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { parseVariantsData } from "@iosevka/data-export/variants-data";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";
import { sampleImageCountEmOfCv } from "../../amend-readme/src/sections/cv-ot.mjs";

import { addCvTasks } from "../src/index.mjs";
import render from "../src/render-svg.mjs";
import characterVariant from "../src/templates/character-variant.mjs";

const paramsDir = fileURLToPath(new URL("../../../params", import.meta.url));

test("special selectors produce unique sample jobs", async () => {
	const variants = await parseVariantsData({ paramsDir });
	const names = [];
	await addCvTasks({ add: async name => names.push(name) }, variants);
	assert.equal(new Set(names).size, names.length);
	assert.ok(names.includes("cv-less-greater-diagonal-terminal"));
	assert.ok(names.includes("cv-less-greater-vertical-terminal"));
});

test("Markdown sample widths match grouped preview frames", async () => {
	const variants = await parseVariantsData({ paramsDir });
	for (const key of ["digit-form", "bar", "tittle", "punctuation-dot"]) {
		const prime = [...variants.specials, ...variants.primes].find(item => item.key === key);
		assert.ok(prime, key);
		const previewText = prime.descSampleText.length ? prime.descSampleText : prime.hotChars;
		const task = characterVariant({
			theme: "light",
			slopeDependent: prime.slopeDependent,
			previewText,
		});
		assert.equal(task.width, sampleImageCountEmOfCv(prime) * 128, key);
	}
});

test("direct variant samples build conditional and slope-dependent glyphs", async () => {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "iosevka-variant-svg-"));
	try {
		const variants = await parseVariantsData({ paramsDir });
		const taskIds = [];
		for (const [key, variantKey] of [
			["a", "double-storey-serifless"],
			["a", "single-storey-serifless"],
			["lower-ezh", "cursive-corner-hooked-serifless"],
			["lower-iota", "serifless"],
			["lower-iota", "tailed"],
			["bar", "natural-slope"],
			["lig-neq", "vertical"],
			["lig-neq", "vertical-dotted"],
		]) {
			const prime = variants.primes.find(item => item.key === key);
			assert.ok(prime, key);
			const variant = prime.variants.find(item => item.key === variantKey);
			assert.ok(variant, `${key}: ${variantKey}`);
			const id = `cv-${key}-${variantKey}.light`;
			const task = characterVariant({
				theme: "light",
				fontFeatures: variant.snapshotFeatureApplication || {
					[variant.tag || prime.tag]: variant.rank,
				},
				variants: { design: { [key]: variantKey } },
				slopeDependent: !!prime.slopeDependent,
				previewText: prime.descSampleText,
			});
			await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(task));
			taskIds.push(id);
		}

		const fontInfos = ["upright", "italic"].map(slope => ({
			name: slope === "upright" ? "Iosevka-Regular" : "Iosevka-Italic",
			shape: {
				serifs: "sans",
				spacing: "normal",
				weight: 400,
				width: 500,
				slope,
				slopeAngle: slope === "italic" ? 9.4 : 0,
			},
			menu: { family: "Iosevka", version: "34.9.0", width: 5, slope, weight: 400 },
			css: { style: slope === "italic" ? "italic" : "normal", weight: 400 },
			featureControl: { noCvSs: true },
		}));
		await render({ paramsDir, taskDir: dir, outputDir: dir, taskIds, fontInfos });

		const pathsByTask = new Map();
		for (const id of taskIds) {
			for (const theme of ["light", "dark"]) {
				const svg = await fs.readFile(
					path.join(dir, `${id.slice(0, -6)}.${theme}.svg`),
					"utf8",
				);
				const paths = [...svg.matchAll(/<path id="([^"]+)" d="([^"]+)"/g)];
				const refs = [...svg.matchAll(/<use href="#([^"]+)"/g)];
				assert.ok(paths.length && refs.length, id);
				const ids = new Set(paths.map(match => match[1]));
				for (const ref of refs) assert.ok(ids.has(ref[1]), `${id}: ${ref[1]}`);
				if (theme === "light") pathsByTask.set(id, paths.map(match => match[2]).join(""));
			}
		}
		assert.notEqual(
			pathsByTask.get("cv-a-double-storey-serifless.light"),
			pathsByTask.get("cv-a-single-storey-serifless.light"),
		);
		assert.notEqual(
			pathsByTask.get("cv-lower-iota-serifless.light"),
			pathsByTask.get("cv-lower-iota-tailed.light"),
		);
		assert.notEqual(
			pathsByTask.get("cv-lig-neq-vertical.light"),
			pathsByTask.get("cv-lig-neq-vertical-dotted.light"),
		);
		for (const [key, variantKey, codePoint] of [
			["a", "double-storey-serifless", 0x61],
			["a", "single-storey-serifless", 0x61],
			["lower-iota", "tailed", 0x3b9],
		]) {
			const { glyphStore } = await buildGlyphData({
				...fontInfos[0],
				paramsDir,
				variants: { design: { [key]: variantKey } },
			});
			const glyph = glyphStore.queryByUnicodeEnsured(codePoint);
			assert.equal(pathsByTask.get(`cv-${key}-${variantKey}.light`), glyphPath(glyph));
		}
	} finally {
		await fs.rm(dir, { recursive: true, force: true });
	}
});
