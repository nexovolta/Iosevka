import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../../../packages/font-glyphs/src/letter/latin-ext/insular-t.ptl", import.meta.url));
let source = await readFile(path, "utf8");
function replaceOnce(from, to) {
	const at = source.indexOf(from);
	if (at < 0 || source.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	source = source.slice(0, at) + to + source.slice(at + from.length);
}
replaceOnce(
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase",
	"glyph-block-import Letter-Arc-Hook : MakeFlatHook MakeCornerHookBase CutArcTerminal DeltaCutEnd VerticalCutExtension",
);
replaceOnce(
	"\tdefine SLAB-CORNER-HOOK 5\n",
	"\tdefine SLAB-CORNER-HOOK 5\n\tdefine CUT-VERTICAL     6\n\tdefine CUT-DIAGONAL     7\n",
);
replaceOnce("\t\tinclude : dispiro\n\t\t\tstraight.left.start Middle",
	"\t\tlocal arc : dispiro\n\t\t\tstraight.left.start Middle");
replaceOnce(
	"\t\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase SB RightSB top bot].hookEndR\n",
	"\t\t\t\t[Just SLAB-CORNER-HOOK] : [MakeCornerHookBase SB RightSB top bot].hookEndR\n" +
	"\t\t\t\t[Just CUT-DIAGONAL] : DeltaCutEnd Middle RightSB (bot + O) (bot + 0.2 * Hook) Stroke\n" +
	"\t\t\t\t[Just CUT-VERTICAL] : list [HookEnd bot] [g4 (RightSB + [VerticalCutExtension Hook Stroke]) (bot + Hook)]\n",
);
replaceOnce(
	"\t\tinclude : [CLetterForm [DivFrame 1] 0 styBot top bot].botSerif",
	"\t\tinclude : if (styBot === CUT-VERTICAL) [CutArcTerminal arc RightSB top bot Stroke false false] arc\n" +
	"\t\tinclude : [CLetterForm [DivFrame 1] 0 styBot top bot].botSerif",
);
await writeFile(path, source);
