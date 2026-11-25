import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../../../", import.meta.url);
const paths = [
	"packages/font-glyphs/src/letter/latin/lower-il.ptl",
	"packages/font-glyphs/src/letter/latin/lower-r.ptl",
].map(path => fileURLToPath(new URL(path, root)));
const [oldIl, oldR] = await Promise.all(paths.map(path => readFile(path, "utf8")));

function replaceOnce(text, from, to) {
	const at = text.indexOf(from);
	if (at < 0 || text.indexOf(from, at + from.length) !== -1)
		throw new Error(`Expected exactly one occurrence of: ${from}`);
	return text.slice(0, at) + to + text.slice(at + from.length);
}

const il = replaceOnce(oldIl,
	"\t\t\t[Just 'tailed']    CasualCurly\n",
	"\t\t\t[Just 'tailed']    Tailed\n\t\t\t[Just 'maskedTailed'] CasualCurly\n");
const r = replaceOnce(oldR, "\t\t\ttailed           'tailed'\n", "\t\t\ttailed           'maskedTailed'\n");
await Promise.all([il, r].map((text, index) => writeFile(paths[index], text)));
