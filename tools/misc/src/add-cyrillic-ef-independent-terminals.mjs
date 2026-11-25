import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const sourceUrl = new URL("../../../packages/font-glyphs/src/letter/greek/phi.ptl", import.meta.url);
const tomlUrl = new URL("../../../params/variants.toml", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
let toml = await readFile(tomlUrl, "utf8");
const before = parse(TOML.parse(toml));
function once(text, old, replacement) {
	const at = text.indexOf(old);
	assert.ok(at >= 0 && text.indexOf(old, at + old.length) < 0, `Expected one occurrence: ${old}`);
	return text.slice(0, at) + replacement + text.slice(at + old.length);
}
source = once(source, "\tglyph-block-import Letter-Latin-Lower-T : yShortNeck1 yShorterNeck\n", "\tglyph-block-import Letter-Latin-Lower-T : yShortNeck1 yShorterNeck\n\tglyph-block-import Letter-Arc-Hook : DeltaCutStart DeltaCutEnd VerticalCutExtension\n");
source = once(source, "\t\t\t\tDiagTail.L df.middle y1 ([DiagTail.StdDepth dfHook sw] - 0.5 * sw) sw\n", "\t\t\t\tDiagTail.L df.middle y1 [Math.min ([DiagTail.StdDepth dfHook sw] - 0.5 * sw) (0.45 * (y2 - y1))] sw\n");
source = once(source, "\tdefine [MtSerif df y4 sw]", `\tdefine [IndependentCursiveBar topStyle bottomStyle] : function [df y1 y2 y3 y4 sw] : glyph-proc
\t\tlocal adwsHook : quantize [mix 1 (1 / df.adws) 0.5] (1 / 6)
\t\tlocal mulHook : mix 1 adwsHook 1.5
\t\tlocal dfHook : DivFrame adwsHook 1 mulHook
\t\tlocal hd : FlatHookDepth dfHook
\t\tlocal xLeft : [mix 0 dfHook.leftSB mulHook] + (df.middle - dfHook.middle)
\t\tlocal xRight : [mix dfHook.width dfHook.rightSB mulHook] + (df.middle - dfHook.middle)
\t\tlocal barLeft : df.middle - [HSwToV : 0.5 * sw]
\t\tlocal barRight : df.middle + [HSwToV : 0.5 * sw]
\t\tlocal upperHook : Math.min Hook (y4 - y3)
\t\tlocal lowerHook : Math.min Hook (y2 - y1)

\t\tif (topStyle === 'straight') : include : VBar.m df.middle (y3 - HalfStroke) y4 sw
\t\tif (topStyle === 'flatHooked') : include : dispiro
\t\t\twidths.lhs sw
\t\t\tflat xRight y4
\t\t\tcurl [Math.min (barLeft + hd.x) (xRight - TINY)] y4
\t\t\tarchv
\t\t\tflat barLeft [Math.max y3 (y4 - hd.y)]
\t\t\tcurl barLeft (y3 + O)
\t\tif (topStyle === 'diagonalTailed') : include : with-transform [ApparentTranslate 0 y4]
\t\t\twith-transform [ScaleAround df.middle 0 (-1) (-1)] : dispiro
\t\t\t\twidths.center sw
\t\t\t\tflat df.middle (y4 - y3 + HalfStroke) [heading Downward]
\t\t\t\tDiagTail.L df.middle 0 [Math.min ([DiagTail.StdDepth dfHook sw] - 0.5 * sw) (0.45 * (y4 - y3))] sw
\t\tif (topStyle === 'roundedTailed' || topStyle === 'verticalCut' || topStyle === 'diagonalCut') : begin
\t\t\tlocal shape : dispiro
\t\t\t\twidths.lhs sw
\t\t\t\tif (topStyle === 'diagonalCut')
\t\t\t\t\tDeltaCutStart [mix barLeft xRight 0.5] xRight (y4 - O) (y4 - 0.2 * upperHook) sw
\t\t\t\t\tlist
\t\t\t\t\t\tg4 (xRight + [if (topStyle === 'verticalCut') [VerticalCutExtension upperHook sw] 0]) (y4 - upperHook)
\t\t\t\t\t\tHookStart y4 (sw -- sw)
\t\t\t\tflat barLeft [Math.max y3 (y4 - ArchDepthA)]
\t\t\t\tcurl barLeft (y3 + O) [heading Downward]
\t\t\tinclude : if (topStyle === 'verticalCut') [intersection shape [MaskLeft xRight]] shape

\t\tif (bottomStyle === 'straight') : include : VBar.m df.middle y1 (y2 + HalfStroke) sw
\t\tif (bottomStyle === 'flatHooked') : include : dispiro
\t\t\twidths.lhs sw
\t\t\tflat xLeft y1
\t\t\tcurl [Math.max (barRight - hd.x) (xLeft + TINY)] y1
\t\t\tarchv
\t\t\tflat barRight [Math.min y2 (y1 + hd.y)]
\t\t\tcurl barRight (y2 - O)
\t\tif (bottomStyle === 'diagonalTailed') : include : dispiro
\t\t\twidths.center sw
\t\t\tflat df.middle (y2 + HalfStroke) [heading Downward]
\t\t\tDiagTail.L df.middle y1 [Math.min ([DiagTail.StdDepth dfHook sw] - 0.5 * sw) (0.45 * (y2 - y1))] sw
\t\tif (bottomStyle === 'roundedTailed' || bottomStyle === 'verticalCut' || bottomStyle === 'diagonalCut') : begin
\t\t\tlocal shape : dispiro
\t\t\t\twidths.rhs sw
\t\t\t\tflat barRight (y2 - O) [heading Downward]
\t\t\t\tcurl barRight [Math.min y2 (y1 + ArchDepthA)]
\t\t\t\tif (bottomStyle === 'diagonalCut')
\t\t\t\t\tDeltaCutEnd [mix xLeft barRight 0.5] xLeft (y1 + O) (y1 + 0.2 * lowerHook) sw
\t\t\t\t\tlist
\t\t\t\t\t\tHookEnd y1 (sw -- sw)
\t\t\t\t\t\tg4 (xLeft - [if (bottomStyle === 'verticalCut') [VerticalCutExtension lowerHook sw] 0]) (y1 + lowerHook)
\t\t\tinclude : if (bottomStyle === 'verticalCut') [intersection shape [MaskRight xLeft]] shape

\tdefine [MtSerif df y4 sw]`);
const names = ["straight", "flatHooked", "roundedTailed", "diagonalTailed", "verticalCut", "diagonalCut"];
const cap = s => s[0].toUpperCase() + s.slice(1);
const choices = names.map(name => `\t\t\ttop${cap(name)} '${name}'`).join("\n");
const bottoms = names.map(name => `\t\t\tbottom${cap(name)} '${name}'`).join("\n");
source = once(source, "\tselect-variant 'cyrl/ef' 0x444\n", `\tdefine CyrlLowerEfIndependentConfig : SuffixCfg.weave
\t\tobject # bowl
\t\t\t''                  {[PhiRing true]              para.advanceScaleM }
\t\t\tsplitBowl           {[CyrEfSplitRing 'toothed']  para.advanceScaleMM}
\t\t\tsplitBowlFlatTop    {[CyrEfSplitRing 'flatTop']  para.advanceScaleMM}
\t\t\tsplitBowlFlatBottom {[CyrEfSplitRing 'flatBot']  para.advanceScaleMM}
\t\t\tsplitBowlFlat       {[CyrEfSplitRing 'flatTB']   para.advanceScaleMM}
\t\tobject # top
${choices}
\t\tobject # bottom
${bottoms}

\tforeach {suffix {{Bowl adws} topStyle bottomStyle}} [Object.entries CyrlLowerEfIndependentConfig] : do
\t\tcreate-glyph "cyrl/ef.\\(suffix)" : glyph-proc
\t\t\tlocal df : include : DivFrame adws 3
\t\t\tinclude : df.markSet.bp
\t\t\tlocal dim : include : Bowl df 0 XH df.smallArchDepthA df.smallArchDepthB
\t\t\tinclude : [IndependentCursiveBar topStyle bottomStyle] df Descender 0 XH Ascender dim.swBar

\tselect-variant 'cyrl/ef' 0x444
`);
const main = "prime.cyrl-ef.variants-buildup";
const extra = "prime.cyrl-ef.variants-extra-buildup";
const start = toml.indexOf(`[${main}.stages.bowl."*"]`);
const end = toml.indexOf(`[${main}.stages.bar."*"]`, start);
assert.ok(start >= 0 && end > start);
let bowls = toml.slice(start, end).replaceAll(main, extra).replace('next = "bar"', 'next = "top"');
const kebab = s => s.replace(/[A-Z]/g, c => "-" + c.toLowerCase());
const stages = side => names.map((name, i) => `[${extra}.stages.${side}.${kebab(name)}]
rank = ${i + 1}
keyAffix = "${side}-${kebab(name)}"
descriptionAffix = "${kebab(name)} ${side} terminal"
selectorAffix."cyrl/ef" = "${side}${cap(name)}"
selectorAffix."cyrl/ef.BGR" = "${side}${cap(name)}"

`).join("");
const rankOffset = Math.max(...[...before.primes.get("cyrl-ef").variants.values()].map(v => v.rank));
const addition = `[${extra}]
entry = "bowl"
descriptionLeader = "Cyrillic Lower Ef (\`ф\`)"
rankOffset = ${rankOffset}

${bowls}[${extra}.stages.top."*"]
next = "bottom"

${stages("top")}${stages("bottom")}`;
toml = once(toml, "[prime.cyrl-capital-i]", `${addition}[prime.cyrl-capital-i]`);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes) for (const [key, variant] of oldPrime.variants) {
	const actual = after.primes.get(name).variants.get(key);
	assert.ok(actual, `${name}.${key}`);
	for (const property of ["tag", "rank", "groupRank", "description"]) assert.deepEqual(actual[property], variant[property], `${name}.${key}.${property}`);
	assert.deepEqual(actual.selector, variant.selector, `${name}.${key}.selector`);
}
assert.equal(after.primes.get("cyrl-ef").variants.size, before.primes.get("cyrl-ef").variants.size + 180);
await writeFile(sourceUrl, source);
await writeFile(tomlUrl, toml);
