import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const sourcePath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/lower-y.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const oldSource = await readFile(sourcePath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldSource.includes("CursiveYShape.VerticalCut")) throw new Error("Cursive-y cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let source = replaceOnce(oldSource,
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookEnd",
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookEnd CutArcTerminal DeltaCutEnd VerticalCutExtension");
const beforeSerifs = "\t\texport : define [Serifs top slabKind] : glyph-proc\n";
const shape = `\t\tdefine [Cut y0 bottom diagonal] : begin
\t\t\tlocal shape : dispiro
\t\t\t\twidths.rhs Stroke
\t\t\t\tflat RightSB y0 [heading Downward]
\t\t\t\tcurl RightSB (bottom + SmallArchDepthA)
\t\t\t\tif diagonal
\t\t\t\t\tDeltaCutEnd [mix SB RightSB 0.5] SB (bottom + O) (bottom + 0.2 * SHook) Stroke
\t\t\t\t\tlist [HookEnd bottom] [g4 (SB - [VerticalCutExtension SHook Stroke]) (bottom + SHook)]
\t\t\treturn : if diagonal shape [CutArcTerminal shape SB y0 bottom Stroke true false]

\t\texport : define [VerticalCut y0 bottom] : Cut y0 bottom false
\t\texport : define [DiagonalCut y0 bottom] : Cut y0 bottom true

`;
source = replaceOnce(source, beforeSerifs, shape + beforeSerifs);
const entry = "\t\t\tcornerHook {CursiveYShape.CornerHook  0    }\n";
source = replaceOnce(source, entry, entry +
	"\t\t\tverticalCut {CursiveYShape.VerticalCut 0}\n" +
	"\t\t\tdiagonalCut {CursiveYShape.DiagonalCut 0}\n");

const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("y");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
const stagesStart = oldToml.indexOf("[prime.y.variants-buildup.stages.body.\"*\"]");
const end = oldToml.indexOf("\n[prime.z]", stagesStart);
if (stagesStart < 0 || end < 0) throw new Error("Cannot locate y stages.");
let stages = oldToml.slice(stagesStart, end).replaceAll("prime.y.variants-buildup", "prime.y.variants-extra-buildup");
const straight = stages.indexOf("[prime.y.variants-extra-buildup.stages.body.straight]");
const cursive = stages.indexOf("[prime.y.variants-extra-buildup.stages.body.cursive]");
const square = stages.indexOf("[prime.y.variants-extra-buildup.stages.body.square-top]");
const hump = stages.indexOf("[prime.y.variants-extra-buildup.stages.hump.\"*\"]");
const hooks = stages.indexOf("[prime.y.variants-extra-buildup.stages.hook.standard]");
const serifs = stages.indexOf("[prime.y.variants-extra-buildup.stages.serifs.serifless]");
if ([straight, cursive, square, hump, hooks, serifs].some(i => i < 0)) throw new Error("Cannot isolate cursive-y stages.");
const cutStages = ["vertical", "diagonal"].map((cut, i) => `[prime.y.variants-extra-buildup.stages.hook.${cut}-cut]
rank = ${i + 1}
descriptionAffix = "${cut}-cut terminal"
selectorAffix.y = "${cut}Cut"
selectorAffix.yShortLeg = "${cut}Cut"
selectorAffix."y/sansSerif" = "${cut}Cut"
selectorAffix."y/nonCursive" = ""
selectorAffix.yHookRight = ""
selectorAffix.yLoop = ""

`).join("");
stages = stages.slice(0, straight) + stages.slice(cursive, square) +
	stages.slice(hump, hooks) + cutStages + stages.slice(serifs);
const extra = `
[prime.y.variants-extra-buildup]
entry = "body"
descriptionLeader = "\`y\`"
rankOffset = ${rankOffset}

${stages}
`;
const toml = oldToml.slice(0, end) + "\n" + extra + oldToml.slice(end);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) for (const [key, variant] of oldPrime.variants) {
	const actual = after.primes.get(name).variants.get(key);
	assert.ok(actual, `${name}.${key}`);
	assert.equal(actual.tag, variant.tag, `${name}.${key}`);
	assert.equal(actual.rank, variant.rank, `${name}.${key}`);
	assert.equal(actual.description, variant.description, `${name}.${key}`);
	assert.deepEqual(actual.selector, variant.selector, `${name}.${key}`);
}
assert.equal(after.primes.get("y").variants.size, prime.variants.size + 20);
await writeFile(sourcePath, source);
await writeFile(tomlPath, toml);
