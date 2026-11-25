import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const tPath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin/lower-t.ptl", root));
const glottalPath = fileURLToPath(new URL("packages/font-glyphs/src/letter/latin-ext/glottal-stop.ptl", root));
const t = await readFile(tPath, "utf8");
const glottal = await readFile(glottalPath, "utf8");
function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}
const updatedT = replaceOnce(t, "\tderive-composites 'tsLig' 0x1BE 'tsLig/upperHalf' 'tsLig/lowerHalf'\r\n", "");
const anchor = "\tCreateTurnedLetter 'invGlottalStop' 0x296 'revGlottalStop' HalfAdvance (Ascender / 2)\n";
const updatedGlottal = replaceOnce(glottal, anchor, anchor +
	"\n\tderive-composites 'tsLig' 0x1BE 'invGlottalStop' : HCrossBar.top (Middle - LongJut) (Middle + LongJut) XH\n");
await writeFile(tPath, updatedT);
await writeFile(glottalPath, updatedGlottal);
