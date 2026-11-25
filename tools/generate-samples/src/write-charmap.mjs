import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { encode } from "@msgpack/msgpack";

import { buildGlyphData, createCharMap } from "../../../packages/font/src/glyph-svg.mjs";

export default main;
async function main(argv) {
	const { glyphStore } = await buildGlyphData(argv);
	const charMap = createCharMap(glyphStore);
	await fs.promises.mkdir(path.dirname(argv.outputPath), { recursive: true });
	await fs.promises.writeFile(argv.outputPath, zlib.gzipSync(encode(charMap)));
}
