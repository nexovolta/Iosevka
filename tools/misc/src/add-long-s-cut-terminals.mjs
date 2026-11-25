import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const root = new URL("../../../", import.meta.url);
const sourcePath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin-ext/long-s.ptl", root));
const tomlPath = fileURLToPath(new URL("params/variants.toml", root));
const oldSource = await readFile(sourcePath, "utf8");
const oldToml = await readFile(tomlPath, "utf8");
if (oldSource.includes("longs.verticalCut")) throw new Error("Long-s cuts already exist.");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
let source = replaceOnce(oldSource,
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookOffset CornerHookOutset",
	"glyph-block-import Letter-Arc-Hook : CornerHookDepth CornerHookOffset CornerHookOutset CutArcTerminal DeltaCutStart VerticalCutExtension");
const insertAt = "\tdefine [StandardSerifs m0 fSlab _kSerif] : glyph-proc\n";
const helpers = `\tdefine [LongSCutUpperHalf x top bottom hookX hookY sw cut] : glyph-proc
\t\tlocal edge : x + hookX
\t\tlocal left : x - [HSwToV : 0.5 * sw]
\t\tlocal shape : dispiro
\t\t\twidths.lhs sw
\t\t\tif (cut === 'diagonal')
\t\t\t\tDeltaCutStart [mix left edge 0.5] edge (top - O) (top - 0.2 * hookY) sw
\t\t\t\tlist [g4 (edge + [VerticalCutExtension hookY sw]) (top - hookY)] [HookStart top (sw -- sw)]
\t\t\tflat left (top - ArchDepthA)
\t\t\tcurl left bottom [heading Downward]
\t\tinclude : if (cut === 'diagonal') shape [CutArcTerminal shape edge top bottom sw false true]

\tdefine [LongSCutShape top bottom hookx hooky cut] : union
\t\tLongSCutUpperHalf Middle top [mix top bottom 0.5] hookx hooky Stroke cut
\t\tLongSLowerHalf (+1) Middle [mix top bottom 0.5] bottom hookx hooky Stroke false

\tdefine [LongSCutNoTailShape m yBot fSlab _kSerif cut] : glyph-proc
\t\tlocal x : m + [HSwToV HalfStroke]
\t\tinclude : LongSCutUpperHalf x Ascender yBot (RightSB - x) Hook Stroke cut
\t\tinclude : LeaningAnchor.Above.Hook m RightSB
\t\tset-base-anchor 'overlay' (m + [HSwToV : 0.65 * Stroke]) [mix 0 Ascender OverlayPos]
\t\tinclude : StandardSerifs m fSlab _kSerif

`;
source = replaceOnce(source, insertAt, helpers + insertAt);
for (const cut of ["vertical", "diagonal"]) {
	const names = [
		"cornerHook", "cornerHookExt",
		"cornerHookDescending", "cornerHookExtDescending",
		"cornerHookTailed", "cornerHookExtTailed",
		"cornerHookDiagonalTailed", "cornerHookExtDiagonalTailed",
	];
	for (const name of names) {
		const marker = `\t\tcreate-glyph "longs.${name}\\(suffix)" : glyph-proc\n`;
		const start = source.indexOf(marker);
		const remainder = source.slice(start + marker.length);
		const boundary = remainder.search(/\n\t(?:\tcreate-glyph |#|define |foreach |select-variant )/);
		if (start < 0 || boundary < 0) throw new Error(`Cannot locate long-s glyph: ${name}`);
		const end = start + marker.length + boundary;
		const original = source.slice(start, end);
		const copy = original.replaceAll("cornerHook", `${cut}Cut`)
			.replaceAll("LongSFlatHookNoTailShape m 0 serifStyle nothing true", `LongSCutNoTailShape m 0 serifStyle nothing '${cut}'`)
			.replaceAll("LongSFlatHookNoTailShape m Descender false nothing true", `LongSCutNoTailShape m Descender false nothing '${cut}'`)
			.replaceAll("LongSShape Ascender Descender (HookX + QuarterStroke) Hook nothing true false", `LongSCutShape Ascender Descender (HookX + QuarterStroke) Hook '${cut}'`);
		source = source.slice(0, end) + "\n" + copy + source.slice(end);
	}
}
source = replaceOnce(source,
	"foreach topSuffix {'bentHook' 'flatHook' 'cornerHook'} : do",
	"foreach topSuffix {'bentHook' 'flatHook' 'cornerHook' 'verticalCut' 'diagonalCut'} : do");
const before = parse(TOML.parse(oldToml));
const prime = before.primes.get("long-s");
const rankOffset = Math.max(...[...prime.variants.values()].map(v => v.rank));
const stagesStart = oldToml.indexOf("[prime.long-s.variants-buildup.stages.top.\"*\"]");
const end = oldToml.indexOf("\n[prime.lower-eszet]", stagesStart);
if (stagesStart < 0 || end < 0) throw new Error("Cannot locate long-s stages.");
let stages = oldToml.slice(stagesStart, end).replaceAll("prime.long-s.variants-buildup", "prime.long-s.variants-extra-buildup");
const topStart = stages.indexOf("[prime.long-s.variants-extra-buildup.stages.top.bent-hook]");
const bottomStart = stages.indexOf("[prime.long-s.variants-extra-buildup.stages.bottom.\"*\"]");
if (topStart < 0 || bottomStart < 0) throw new Error("Cannot isolate long-s top stages.");
const tops = ["vertical", "diagonal"].map((cut, i) => `[prime.long-s.variants-extra-buildup.stages.top.${cut}-cut]
rank = ${i + 1}
groupRank = 20
descriptionAffix = "${cut}-cut top"
selectorAffix.longs = "${cut}Cut"
selectorAffix."longs/compLigLeft" = "${cut}CutExt"
selectorAffix.longsBar = "${cut}Cut"
selectorAffix.longssHookBottom = "longSSLig"

`).join("");
stages = stages.slice(0, topStart) + tops + stages.slice(bottomStart);
const extra = `
[prime.long-s.variants-extra-buildup]
entry = "top"
descriptionLeader = "Long S (\`ſ\`)"
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
assert.equal(after.primes.get("long-s").variants.size, prime.variants.size + 40);
await writeFile(sourcePath, source);
await writeFile(tomlPath, toml);
