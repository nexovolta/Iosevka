import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const oldToml = await fs.readFile(tomlPath, "utf8");
const before = parse(TOML.parse(oldToml));
const styles = [
	["rounded", "Rounded", "serifless"],
	["serifed", "Serifed", "unilateralSerifed"],
	["inward-serifed", "InwardSerifed", "unilateralInwardSerifed"],
	["flat-hooked", "FlatHook", "topFlatHook"],
	["corner-hooked", "CornerHook", "topCornerHook"],
	["vertical-cut", "VerticalCut", "serifless"],
	["diagonal-cut", "DiagonalCut", "serifless"],
];
const cuts = styles.slice(5);

function replaceOnce(text, beforeText, afterText) {
	const at = text.indexOf(beforeText);
	if (at < 0 || text.indexOf(beforeText, at + beforeText.length) >= 0)
		throw new Error(`Expected exactly one occurrence of: ${beforeText}`);
	return text.slice(0, at) + afterText + text.slice(at + beforeText.length);
}

function conditional(values) {
	let result = JSON.stringify(values.at(-1));
	for (let i = values.length - 2; i >= 0; i--)
		result = `{ if = [{ "top-arc" = ${JSON.stringify(styles[i][0])} }], then = ${JSON.stringify(values[i])}, else = ${result} }`;
	return result;
}

function editPrime(text, name, nextPrime, isCapital) {
	const start = text.indexOf(`[prime.${name}]`);
	const end = text.indexOf(`[prime.${nextPrime}]`, start);
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${name}.`);
	let section = text.slice(start, end);
	if (section.includes(`stages.top-arc.vertical-cut]`))
		throw new Error(`${name} cut combinations already exist.`);
	if (isCapital)
		section = replaceOnce(section, 'tagKind = "letter"', 'tagKind = "letter"\noverflowTagOrder = 75');

	const prefix = `[prime.${name}.variants-extra-buildup.stages.`;
	const glyphs = isCapital ? ["cyrl/E", "cyrl/YeUkrainian"] : ["cyrl/e", "cyrl/yeUkrainian"];
	const baseGlyphs = isCapital ? [...glyphs, "currency/euroSign"] : glyphs;
	let tops = "";
	for (const [index, [key]] of cuts.entries())
		tops += `${prefix}top-arc.${key}]\nrank = ${index + 6}\nkeyAffix = "top-${key}"\ndescriptionAffix = "${key} top"\n\n`;
	section = replaceOnce(section, `${prefix}bottom-arc.rounded]`, `${tops}${prefix}bottom-arc.rounded]`);

	for (const [bottom, bottomSuffix] of styles.slice(0, 5)) {
		const marker = `${prefix}bottom-arc.${bottom}]`;
		const at = section.indexOf(marker);
		const endStage = section.indexOf("\n[prime.", at + marker.length);
		if (at < 0 || endStage < 0) throw new Error(`Cannot locate ${marker}`);
		let stage = section.slice(at, endStage);
		for (const glyph of [...baseGlyphs, ...glyphs.map(g => `${g}/topSerif`)]) {
			const field = `selectorAffix.${JSON.stringify(glyph)}`;
			const line = stage.split("\n").find(x => x.startsWith(`${field} = `));
			if (!line) throw new Error(`Missing ${field} in ${marker}`);
			const oldValue = line.slice(field.length + 3);
			const values = glyph.endsWith("/topSerif")
				? ["serifless", "serifless"]
				: cuts.map(([, suffix]) => `top${suffix}Bottom${bottomSuffix}`);
			const wrapped = `{ if = [{ "top-arc" = "vertical-cut" }], then = ${JSON.stringify(values[0])}, else = { if = [{ "top-arc" = "diagonal-cut" }], then = ${JSON.stringify(values[1])}, else = ${oldValue} } }`;
			stage = replaceOnce(stage, line, `${field} = ${wrapped}`);
		}
		section = section.slice(0, at) + stage + section.slice(endStage);
	}

	let bottoms = "";
	for (const [index, [bottom, bottomSuffix]] of cuts.entries()) {
		bottoms += `${prefix}bottom-arc.${bottom}]\nrank = ${index + 6}\nnext = "bar-selector"\nkeyAffix = "bottom-${bottom}"\ndescriptionAffix = "${bottom} bottom"\n`;
		for (const glyph of baseGlyphs)
			bottoms += `selectorAffix.${JSON.stringify(glyph)} = ${conditional(styles.map(([, suffix]) => `top${suffix}Bottom${bottomSuffix}`))}\n`;
		for (const glyph of glyphs)
			bottoms += `selectorAffix.${JSON.stringify(`${glyph}/topSerif`)} = ${conditional(styles.map(([, , suffix]) => suffix))}\n`;
		bottoms += "\n";
	}
	section = replaceOnce(section, `${prefix}bar-selector."*"]`, `${bottoms}${prefix}bar-selector."*"]`);

	const prime = before.primes.get(name);
	let nextRank = Math.max(...[...prime.variants.values()].map(v => v.rank)) + 1;
	const bars = isCapital
		? ["straight", "diagonal-crossbar-rising", "diagonal-crossbar-falling", "straight-middle-serifed", "diagonal-crossbar-rising-middle-serifed", "diagonal-crossbar-falling-middle-serifed"]
		: ["straight", "diagonal-crossbar-rising", "diagonal-crossbar-falling"];
	for (const bar of bars) {
		const middle = bar.endsWith("-middle-serifed");
		const barPrefix = bar.replace("-middle-serifed", "");
		const ranks = styles.map(([top]) => {
			const entries = styles.map(([bottom]) => {
				const key = `${barPrefix === "straight" ? "" : `${barPrefix}-`}top-${top}-bottom-${bottom}${middle ? "-middle-serifed" : ""}`;
				const old = prime.variants.get(key);
				const rank = old ? old.rank : nextRank++;
				return `${JSON.stringify(bottom)} = ${rank}`;
			});
			return `${JSON.stringify(top)} = { "bottom-arc" = { ${entries.join(", ")} } }`;
		});
		const marker = `${prefix}bar-selector.${bar}]\n`;
		section = replaceOnce(section, marker, `${marker}variantRank = { "top-arc" = { ${ranks.join(", ")} } }\n`);
	}
	assert.equal(nextRank, isCapital ? 370 : 224);
	return text.slice(0, start) + section + text.slice(end);
}

let toml = editPrime(oldToml, "cyrl-capital-e", "cyrl-e", true);
toml = editPrime(toml, "cyrl-e", "cyrl-koppa", false);
const after = parse(TOML.parse(toml));
for (const [name, prime] of before.primes) {
	const actual = after.primes.get(name);
	assert.equal(actual.tag, prime.tag, name);
	for (const [key, variant] of prime.variants) {
		const v = actual.variants.get(key);
		assert.ok(v, `${name}.${key}`);
		assert.equal(v.tag, variant.tag, `${name}.${key}`);
		assert.equal(v.rank, variant.rank, `${name}.${key}`);
		assert.equal(v.description, variant.description, `${name}.${key}`);
		assert.deepEqual(v.selector, variant.selector, `${name}.${key}`);
	}
}
assert.equal(after.primes.get("cyrl-capital-e").variants.size, before.primes.get("cyrl-capital-e").variants.size + 144);
assert.equal(after.primes.get("cyrl-e").variants.size, before.primes.get("cyrl-e").variants.size + 72);
await fs.writeFile(tomlPath, toml);
console.log("Added Cyrillic E cut combinations; all existing variants and feature tags are unchanged.");
