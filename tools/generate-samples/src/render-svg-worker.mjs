import fs from "node:fs/promises";
import path from "node:path";
import { parentPort, workerData } from "node:worker_threads";

import { renderSampleSvg } from "./svg-sample-renderer.mjs";

try {
	for (const task of workerData.tasks) {
		for (const theme of ["light", "dark"]) {
			const svg = renderSampleSvg(task, workerData.contexts, theme);
			await fs.writeFile(
				path.join(workerData.outputDir, `${task.id}.${theme}.svg`),
				svg,
				"utf8",
			);
		}
	}
	parentPort.postMessage({ completed: workerData.tasks.length });
} catch (error) {
	parentPort.postMessage({ error: error.stack || String(error) });
}
parentPort.close();
