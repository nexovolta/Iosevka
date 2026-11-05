import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import main from "@iosevka/font";

import { nexsevkaMetricOverride, nexsevkaWeights } from "./nexsevka-currency-metrics.mjs";

const root = fileURLToPath(new URL("../../..", import.meta.url));
if (!process.argv[2]) throw new Error("Provide an output directory, optionally followed by weight names and --only=U+XXXX");
const out = path.resolve(process.argv[2]);
await mkdir(out, { recursive: true });

const fonts = [...nexsevkaWeights.map(row => [...row, "upright"]), ["BoldItalic", 920, 700, "italic"]];
const args = process.argv.slice(3);
const onlyArgs = args.filter(arg => arg.startsWith("--only="));
if (onlyArgs.length > 1 || (onlyArgs.length && !/^--only=U\+[0-9a-f]{4,6}$/i.test(onlyArgs[0]))) {
	throw new Error("Expected at most one --only=U+XXXX argument");
}
const labels = args.filter(arg => !arg.startsWith("--only="));
for (const label of labels) {
	if (!fonts.some(font => font[0] === label)) throw new Error(`Unknown weight: ${label}`);
}
const text = onlyArgs.length
	? String.fromCodePoint(Number.parseInt(onlyArgs[0].slice(9), 16))
	: "\u20b0\u20b7\u20bb\u20c2\u20c4\u20a4\u00a3\u204a\uA778SA\u0427\u04b8\u04b9\u04ba\u0526\ua686\ua694h";
for (const [label, weight, menuWeight, slope] of fonts) {
	if (labels.length && !labels.includes(label)) continue;
	await main({
		name: `NexCurrency-${label}`,
		paramsDir: path.join(root, "params"),
		o: path.join(out, `NexCurrency-${label}.ttf`),
		oTtfaControls: path.join(out, `NexCurrency-${label}.ttfa.txt`),
		cache: { input: null, output: path.join(out, `NexCurrency-${label}.cache.mpz`), freshAgeKey: "nex-currency" },
		featureControl: { noCvSs: false, noLigation: true, exportGlyphNames: true },
		variants: { design: {
			"capital-s": "bilateral-inward-serifed",
			"cyrl-capital-che": "flat-hump-motion-serifed",
			h: "flat-hump-straight-serifless",
			sterling: "serifed-inward-serifed",
			"capital-latin-gamma": "triangle-bottom-top-right-motion-serifed",
			"latin-gamma": "bilateral-motion-serifed",
		} },
		metricOverride: nexsevkaMetricOverride,
		shape: { serifs: "sans", spacing: "term", weight, width: 586, slope, slopeAngle: slope === "italic" ? 10 : 0 },
		menu: { family: "Nex Currency QA", version: "34.9.0", width: 5, slope, weight: menuWeight },
		subset: { include: { text } },
	});
	console.log(`Built ${label}`);
}
