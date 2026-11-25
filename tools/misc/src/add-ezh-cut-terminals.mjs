import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const ptlPath = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/latin-ext/ezh.ptl", import.meta.url));
const tomlPath = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
const oldPtl = await readFile(ptlPath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldPtl.includes("straightVerticalCutSerifless")) throw new Error("Ezh cuts already exist.");

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let ptl = replaceOnce(oldPtl,
	"define PhoneticEzhHooks : list 'serifless' 'serifed' 'inwardSerifed' 'flatHook' 'cornerHook'",
	"define PhoneticEzhHooks : list 'serifless' 'serifed' 'inwardSerifed' 'flatHook' 'cornerHook' 'verticalCut' 'diagonalCut'");
ptl = replaceOnce(ptl,
	"\t\tcursiveHookCornerTopSerifed         {true   true   'cornerHook'   }\n",
	"\t\tcursiveHookCornerTopSerifed         {true   true   'cornerHook'   }\n" +
	["straight", "cursive"].flatMap((body, i) =>
		["VerticalCut", "DiagonalCut"].flatMap(cut =>
			["Serifless", "TopSerifed"].map((serif, j) =>
				`\t\t${body}${cut}${serif} {${i ? "true" : "false"} ${j ? "true" : "false"} '${cut[0].toLowerCase()}${cut.slice(1)}'}\n`,
			),
		),
	).join(""));

const revStart = ptl.indexOf("\tglyph-block-export RevEzh");
const revEnd = ptl.indexOf("\n\tdefine LegacyEzhConfig", revStart);
if (revStart < 0 || revEnd < 0) throw new Error("Cannot locate reversed ezh.");
let rev = ptl.slice(revStart, revEnd);
const originalStart = "\t\t\tinclude : union\n\t\t\t\tif fCursive [CursiveTop] [ConventionalTop]\n\t\t\t\tdispiro\n";
const bowlStart = rev.indexOf(originalStart);
const bowlEnd = rev.indexOf("\n\t\t\tif (terminal === TERMINAL-HOOK && hookStyle === 'serifed')", bowlStart);
if (bowlStart < 0 || bowlEnd < 0) throw new Error("Cannot locate reversed ezh bowl.");
const bowl = rev.slice(bowlStart + originalStart.length, bowlEnd).replace(/^\t/gm, "");
rev = rev.slice(0, bowlStart) + "\t\t\tlocal bowl : dispiro\n" + bowl +
	"\n\t\t\tinclude : union\n" +
	"\t\t\t\tif fCursive [CursiveTop] [ConventionalTop]\n" +
	"\t\t\t\tif (terminal === TERMINAL-HOOK && hookStyle === 'verticalCut') [CutArcTerminal bowl RightSB yMidRight bottom stroke false false] bowl\n" +
	rev.slice(bowlEnd);
rev = replaceOnce(rev,
	"\t\t\t\t\t\t\t[Just 'cornerHook'] : [MakeCornerHook SB RightSB top bottom (sw -- stroke)].hookEndR\n",
	"\t\t\t\t\t\t\t[Just 'cornerHook'] : [MakeCornerHook SB RightSB top bottom (sw -- stroke)].hookEndR\n" +
	"\t\t\t\t\t\t\t[Just 'diagonalCut'] : DeltaCutEnd Middle RightSB (bottom + O) (bottom + 0.2 * hook) stroke\n" +
	"\t\t\t\t\t\t\t[Just 'verticalCut'] : list [HookEnd bottom (sw -- stroke)] [g4 (RightSB + [VerticalCutExtension hook stroke]) (bottom + hook)]\n");
ptl = ptl.slice(0, revStart) + rev + ptl.slice(revEnd);

for (const [startMarker, endMarker, oldHook] of [
	['create-glyph "ezhPalatalHook.\\(suffix)"', "\n\tdefine [PhoneticEzhPalatal", "hookStyle  -- hookStyle"],
	["define [PhoneticEzhPalatal", "\n\tforeach {suffix {fCursive fSerifed}}", "hookStyle -- hookStyle"],
]) {
	const start = ptl.indexOf(startMarker);
	const end = ptl.indexOf(endMarker, start);
	if (start < 0 || end < 0) throw new Error(`Cannot locate ${startMarker}`);
	const region = ptl.slice(start, end);
	const fixed = replaceOnce(region, oldHook,
		"hookStyle  -- [if (hookStyle === 'verticalCut' || hookStyle === 'diagonalCut') 'serifless' hookStyle]");
	ptl = ptl.slice(0, start) + fixed + ptl.slice(end);
}

function extra(prime, selector, phonetic) {
	const header = `[prime.${prime}.variants-extra-buildup`;
	return `
${header}]
entry = "body"
descriptionLeader = "${prime}"
rankOffset = 20

${header}.stages.body."*"]
next = "cut"

${header}.stages.body.straight]
rank = 1
descriptionAffix = "straight body"
selectorAffix.${selector} = "straight"

${header}.stages.body.cursive]
rank = 2
descriptionAffix = "cursive body"
selectorAffix.${selector} = "cursive"

${header}.stages.cut."*"]
next = "serifs"

${["vertical", "diagonal"].map((cut, i) => `${header}.stages.cut.${cut}-cut]
rank = ${i + 1}
descriptionAffix = "${cut}-cut terminal"
selectorAffix.${selector} = "${cut[0].toUpperCase()}${cut.slice(1)}Cut"
${phonetic ? `selectorAffix."ezh/phoneticHook" = "${cut}Cut"\n` : ""}
`).join("\n")}
${header}.stages.serifs.serifless]
rank = 1
descriptionAffix = "serifless top"
selectorAffix.${selector} = "Serifless"

${header}.stages.serifs.top-serifed]
rank = 2
descriptionAffix = "top-serifed top"
selectorAffix.${selector} = "TopSerifed"

`;
}
let toml = replaceOnce(oldToml, "[prime.lower-ezh]", `${extra("capital-ezh", "Ezh", false)}[prime.lower-ezh]`);
toml = replaceOnce(toml, "[prime.lower-alpha]", `${extra("lower-ezh", "ezh", true)}[prime.lower-alpha]`);
const before = parse(TOML.parse(oldToml));
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) {
	const newPrime = after.primes.get(name);
	assert.equal(newPrime.tag, oldPrime.tag, name);
	for (const [key, variant] of oldPrime.variants) {
		const actual = newPrime.variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		assert.equal(actual.tag, variant.tag, `${name}.${key}`);
		assert.equal(actual.rank, variant.rank, `${name}.${key}`);
		assert.equal(actual.description, variant.description, `${name}.${key}`);
		assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
	}
}
for (const name of ["capital-ezh", "lower-ezh"])
	assert.equal(after.primes.get(name).variants.size, before.primes.get(name).variants.size + 8);
await writeFile(ptlPath, ptl);
await writeFile(tomlPath, toml);
