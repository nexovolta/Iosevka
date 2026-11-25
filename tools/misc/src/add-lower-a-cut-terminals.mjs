import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";

import * as TOML from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const sourceUrl = new URL(
	"../../../packages/font-glyphs/src/letter/latin/lower-a.ptl",
	import.meta.url,
);
const tomlUrl = new URL("../../../params/variants.toml", import.meta.url);
let source = await readFile(sourceUrl, "utf8");
let toml = await readFile(tomlUrl, "utf8");
const before = parse(TOML.parse(toml));
function once(text, original, replacement) {
	const at = text.indexOf(original);
	assert.ok(
		at >= 0 && text.indexOf(original, at + original.length) < 0,
		`Expected one occurrence: ${original}`,
	);
	return text.slice(0, at) + replacement + text.slice(at + original.length);
}
source = once(
	source,
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHook CutArcTerminal DeltaCutStart VerticalCutExtension",
);
source = once(
	source,
	"\tdefine HOOK-CORNER         5\n",
	"\tdefine HOOK-CORNER         5\n\tdefine HOOK-VERTICAL-CUT   6\n\tdefine HOOK-DIAGONAL-CUT   7\n",
);
source = once(
	source,
	"\t\t\t\t\t[Just HOOK-CORNER] : [MakeCornerHook df.leftSB df.rightSB XH 0 (sw -- stroke)].hookStartL\n",
	`\t\t\t\t\t[Just HOOK-CORNER] : [MakeCornerHook df.leftSB df.rightSB XH 0 (sw -- stroke)].hookStartL
\t\t\t\t\t[Just HOOK-DIAGONAL-CUT] : DeltaCutStart [mix hookLeftX barRightX 0.5] hookLeftX (XH - O) (XH - 0.2 * AHook) stroke
\t\t\t\t\t[Just HOOK-VERTICAL-CUT] : list
\t\t\t\t\t\tg4 (hookLeftX - [VerticalCutExtension AHook stroke]) (XH - AHook)
\t\t\t\t\t\tHookStart XH (sw -- stroke)
`,
);
source = once(
	source,
	"\t\t\t\t\t[Just HOOK-CORNER] : [MakeCornerHook df.leftSB df.rightSB XH 0 (sw -- stroke)].hookStartR\n",
	`\t\t\t\t\t[Just HOOK-CORNER] : [MakeCornerHook df.leftSB df.rightSB XH 0 (sw -- stroke)].hookStartR
\t\t\t\t\t[Just HOOK-DIAGONAL-CUT] : DeltaCutStart [mix barLeftX hookRightX 0.5] hookRightX (XH - O) (XH - 0.2 * AHook) stroke
\t\t\t\t\t[Just HOOK-VERTICAL-CUT] : list
\t\t\t\t\t\tg4 (hookRightX + [VerticalCutExtension AHook stroke]) (XH - AHook)
\t\t\t\t\t\tHookStart XH (sw -- stroke)
`,
);
const inclusion = "\t\t\tinclude : [HookAndBarT dispiro] df hookStyle y0 sw fine\n";
assert.equal(source.split(inclusion).length - 1, 2);
let index = 0;
source = source.replaceAll(inclusion, () => {
	const [edge, left] = index++ === 0 ? ["df.leftSB", "true"] : ["df.rightSB", "false"];
	return `\t\t\tlocal shape : [HookAndBarT dispiro] df hookStyle y0 sw fine\n\t\t\tinclude : if (hookStyle === HOOK-VERTICAL-CUT) [CutArcTerminal shape ${edge} XH y0 sw ${left} true] shape\n`;
});
const maskReturn = "\t\t\treturn : [HookAndBarT spiro-outline] df hookStyle y0 sw fine\n";
assert.equal(source.split(maskReturn).length - 1, 2);
index = 0;
source = source.replaceAll(maskReturn, () => {
	const [edge, left] = index++ === 0 ? ["df.leftSB", "true"] : ["df.rightSB", "false"];
	return `\t\t\tlocal shape : [HookAndBarT spiro-outline] df hookStyle y0 sw fine\n\t\t\treturn : if (hookStyle === HOOK-VERTICAL-CUT) [CutArcTerminal shape ${edge} XH y0 sw ${left} true] shape\n`;
});
source = once(
	source,
	"\t\t\tdoubleStoreyHookCorner        HOOK-CORNER\n",
	"\t\t\tdoubleStoreyHookCorner        HOOK-CORNER\n\t\t\tdoubleStoreyHookVerticalCut   HOOK-VERTICAL-CUT\n\t\t\tdoubleStoreyHookDiagonalCut   HOOK-DIAGONAL-CUT\n",
);

const main = "prime.a.variants-buildup";
const extra = "prime.a.variants-extra-buildup";
const start = toml.indexOf(`[${main}.stages.storey.double-storey]`);
const end = toml.indexOf("\n[prime.", start);
const nextPrime = toml.indexOf("\n[prime.b]", start);
assert.ok(start >= 0 && end > start && nextPrime > start);
let stages = toml.slice(start, nextPrime).replaceAll(main, extra);
const single = stages.indexOf(`[${extra}.stages.storey.single-storey]`);
const hookStart = stages.indexOf(`[${extra}.stages.double-storey-hook."*"]`);
const hookOptions = stages.indexOf(`[${extra}.stages.double-storey-hook.hook-serifless]`);
const ear = stages.indexOf(`[${extra}.stages.ear."*"]`);
const cut = stages.indexOf(`[${extra}.stages.cut."*"]`);
assert.ok(
	single > 0 && hookStart > single && hookOptions > hookStart && ear > hookOptions && cut > ear,
);
const hookTemplate = stages.slice(
	hookOptions,
	stages.indexOf(`[${extra}.stages.double-storey-hook.hook-serifed]`),
);
const hookStages = ["vertical", "diagonal"]
	.map((kind, i) => {
		const suffix = `hook${kind[0].toUpperCase()}${kind.slice(1)}Cut`;
		let stage = hookTemplate
			.replace("hook-serifless]", `hook-${kind}-cut]`)
			.replace("rank = 1", `rank = ${i + 1}`)
			.replace('keyAffix = ""', `keyAffix = "hook-${kind}-cut"`)
			.replace(
				'descriptionAffix = "serifless hook"',
				`descriptionAffix = "${kind}-cut hook"`,
			);
		for (const name of [
			"a",
			'"a/sansSerif"',
			'"a/doubleStorey"',
			"aRTail",
			'"ae/a"',
			'"ao/a"',
			'"cyrl/aye/a"',
			'"au/a"',
			'"av/a"',
			'"ay/a"',
		]) {
			stage = once(
				stage,
				`selectorAffix.${name} = ""`,
				`selectorAffix.${name} = "${suffix}"`,
			);
		}
		return stage;
	})
	.join("");
stages =
	stages.slice(0, single) + stages.slice(hookStart, hookOptions) + hookStages + stages.slice(cut);
const offset = Math.max(...[...before.primes.get("a").variants.values()].map(v => v.rank));
const extraSection = `[${extra}]\nentry = "storey"\ndescriptionLeader = "\`a\`"\nrankOffset = ${offset}\n\n${stages}`;
toml = toml.slice(0, nextPrime) + "\n" + extraSection + toml.slice(nextPrime);
toml = once(
	toml,
	'[prime.a]\nsampler = "a"\ntagKind = "letter"',
	'[prime.a]\nsampler = "a"\ntagKind = "letter"\noverflowTagOrder = 76',
);
const after = parse(TOML.parse(toml));
for (const [name, oldPrime] of before.primes)
	for (const [key, variant] of oldPrime.variants) {
		const actual = after.primes.get(name).variants.get(key);
		assert.ok(actual, `${name}.${key}`);
		for (const property of ["tag", "rank", "groupRank", "description", "selector"]) {
			assert.deepEqual(actual[property], variant[property], `${name}.${key}.${property}`);
		}
	}
assert.ok(after.primes.get("a").variants.size > before.primes.get("a").variants.size);
await writeFile(sourceUrl, source);
await writeFile(tomlUrl, toml);
