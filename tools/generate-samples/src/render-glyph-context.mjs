import { parentPort } from "node:worker_threads";

import { RecursiveBuildFilter } from "@iosevka/glyph/block";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

async function buildContext(workerData) {
	const recursiveFilter = new RecursiveBuildFilter(
		new Set(workerData.glyphIds),
		new Set(workerData.blockIds),
	);
	const { glyphStore } = await buildGlyphData(
		{ ...workerData.fontInfo, paramsDir: workerData.paramsDir },
		recursiveFilter,
		true,
	);
	const glyphs = {};
	for (const name of workerData.glyphNames) {
		const glyph = glyphStore.queryByName(name);
		if (!glyph)
			throw new Error(`Missing rendered glyph ${name} in ${workerData.fontInfo.name}.`);
		glyphs[name] = { d: glyphPath(glyph), advanceWidth: glyph.advanceWidth };
	}
	return glyphs;
}

parentPort.on("message", async ({ index, workerData }) => {
	try {
		parentPort.postMessage({ index, glyphs: await buildContext(workerData) });
	} catch (error) {
		parentPort.postMessage({ index, error: error.stack || String(error) });
	}
});
