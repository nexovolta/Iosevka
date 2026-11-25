import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const tPath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/lower-t.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const tSource = await readFile(tPath, "utf8");
const crlf = tSource.includes("\r\n");
const oldT = tSource.replace(/\r\n/g, "\n");
const oldToml = await readFile(tomlPath, "utf8");
if (oldT.includes("SLAB-VERTICAL-CUT")) throw new Error("t-s ligature cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let t = replaceOnce(oldT,
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart MakeFlatHook MakeCornerHookBase MakeMidHeightLeftHook",
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookStart MakeFlatHook MakeCornerHookBase MakeMidHeightLeftHook CutArcTerminal DeltaCutEnd VerticalCutExtension");
t = replaceOnce(t, "\tdefine SLAB-CORNER-HOOK 5\n",
	"\tdefine SLAB-CORNER-HOOK 5\n\tdefine SLAB-VERTICAL-CUT 6\n\tdefine SLAB-DIAGONAL-CUT 7\n");
const start = t.indexOf("\tdefine [TsLigStrokeShape ");
const end = t.indexOf("\n\tdefine TSUpperConfig", start);
if (start < 0 || end < 0) throw new Error("Cannot locate t-s ligature stroke.");
let stroke = t.slice(start, end);
stroke = replaceOnce(stroke, "\t\treturn : dispiro\n", "\t\tlocal shape : dispiro\n");
const corner = "\t\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase df.leftSB df.rightSB XH 0 (sw -- stroke)].hookEndL\n";
stroke = replaceOnce(stroke, corner, corner +
	"\t\t\t\t[Just SLAB-VERTICAL-CUT] : list [HookEnd 0 (sw -- stroke)] [g4 (df.leftSB - [VerticalCutExtension SHook stroke]) SHook]\n" +
	"\t\t\t\t[Just SLAB-DIAGONAL-CUT] : DeltaCutEnd df.middle df.leftSB O (0.2 * SHook) stroke\n");
stroke += "\n\t\treturn : if (sb === SLAB-VERTICAL-CUT) [CutArcTerminal shape df.leftSB top 0 stroke true false] shape\n";
t = t.slice(0, start) + stroke + t.slice(end);
t = replaceOnce(t, "\t\tcornerHook             {SLAB-CORNER-HOOK}\n",
	"\t\tcornerHook             {SLAB-CORNER-HOOK}\n\t\tverticalCut            {SLAB-VERTICAL-CUT}\n\t\tdiagonalCut            {SLAB-DIAGONAL-CUT}\n");

let toml = oldToml;
for (const [cut, suffix] of [["vertical-cut", "verticalCut"], ["diagonal-cut", "diagonalCut"]]) {
	const stageStart = toml.indexOf(`[prime.s.variants-extra-buildup.stages.bottom-arc.${cut}]`);
	const stageEnd = toml.indexOf("\n[prime.", stageStart + 1);
	if (stageStart < 0 || stageEnd < 0) throw new Error(`Cannot locate ${cut} S stage.`);
	let stage = toml.slice(stageStart, stageEnd);
	const line = stage.split("\n").find(x => x.startsWith('selectorAffix."tsLig/lowerHalf" = '));
	if (!line) throw new Error(`Missing ${cut} t-s selector.`);
	if (line.includes('"serifless"') || line.includes(`"${suffix}"`)) {
		stage = replaceOnce(stage, line, `selectorAffix."tsLig/lowerHalf" = "${suffix}"`);
	} else {
		throw new Error(`Unexpected ${cut} t-s selector: ${line}`);
	}
	toml = toml.slice(0, stageStart) + stage + toml.slice(stageEnd);
}
const before = parse(TOML.parse(oldToml));
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const current = after.primes.get(name);
	assert.equal(current.variants.size, oldPrime.variants.size, name);
	for (const [key, variant] of oldPrime.variants) {
		const actual = current.variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		const expected = { ...variant.selector };
		if (name === "s" && key.endsWith("-bottom-vertical-cut")) expected["tsLig/lowerHalf"] = "verticalCut";
		if (name === "s" && key.endsWith("-bottom-diagonal-cut")) expected["tsLig/lowerHalf"] = "diagonalCut";
		assert.deepEqual(actual.selector, expected, `${name}.${key}`);
	}
}
await writeFile(tPath, crlf ? t.replace(/\n/g, "\r\n") : t);
await writeFile(tomlPath, toml);
