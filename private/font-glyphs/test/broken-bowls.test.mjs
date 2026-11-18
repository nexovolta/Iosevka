import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import * as toml from "@iarna/toml";
import * as Geometry from "@iosevka/geometry";
import { buildGlyphs } from "@iosevka/font-glyphs";
import { parse as parseVariants } from "@iosevka/param/variant";
import { getParametersT } from "../../../packages/font/src/param/index.mjs";

function straightEdges(glyph) {
	const contours = new Geometry.SimplifyGeometry(glyph.geometry, glyph.gizmo, true).toBezArcs();
	const edges = [];
	for (const contour of contours) for (const arc of contour) {
		const points = [0, 0.25, 0.5, 0.75, 1].map(t => glyph.gizmo.unapply(arc.eval(t)));
		const [a, b] = [points[0], points[4]];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		if (Math.abs(dx) < 2) continue;
		if (!points.every((p, i) => Math.abs(p.x - (a.x + dx * i / 4)) < 0.05 && Math.abs(p.y - (a.y + dy * i / 4)) < 0.05)) continue;
		edges.push({ x: a.x, y: a.y, dx, slope: dy / dx });
	}
	return { contours, edges };
}

test("broken variants preserve existing character-variant ranks", () => {
	const path = fileURLToPath(new URL("../../../params/variants.toml", import.meta.url));
	const primes = parseVariants(toml.parse(readFileSync(path, "utf8"))).primes;
	for (const [family, key, rank] of [
		["capital-b", "more-asymmetric-serifless", 7],
		["capital-b", "more-asymmetric-interrupted-bilateral-serifed", 12],
		["capital-thorn", "asymmetric-serifless", 7],
		["capital-thorn", "asymmetric-open-serifed", 12],
		["capital-p", "open-serifed", 6],
		["cyrl-ve", "rounded-top-interrupted-unilateral-bottom-serifed", 10],
	]) {
		assert.equal(primes.get(family).variants.get(key).rank, rank, `${family}.${key}`);
	}
});

test("broken B and double thorn keep both counters and a constant-width diagonal", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Broken bowl QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Letter-Latin-Upper-B", "Letter-Latin-Double-Thorn-Wynn"].includes(id),
			glyphIsNeeded: id => /^(?:B|ThornDouble)(?:\.|$)/.test(id),
		});
		for (const family of ["B", "ThornDouble"]) for (const symmetry of ["standard", "moreAsymmetric"]) {
			const closed = straightEdges(glyphStore.queryByNameEnsured(`${family}.${symmetry}Serifless`));
			const horizontal = closed.edges.filter(e => Math.abs(e.slope) < 0.001 && e.y > 735 * 0.25 && e.y < 735 * 0.75);
			const heights = [...new Set(horizontal.map(e => Math.round(e.y * 1000) / 1000))].sort((a, b) => a - b);
			assert.equal(heights.length, 2, `${slope} ${weight} ${family} ${symmetry}: horizontal connection`);
			const connectionWidth = heights[1] - heights[0];
			for (const [direction, sign] of [["Rising", 1], ["Falling", -1]]) {
				const name = `${family}.${symmetry}Broken${direction}Serifless`;
				const { contours, edges } = straightEdges(glyphStore.queryByNameEnsured(name));
				assert.equal(contours.length, 3, `${slope} ${weight} ${name}: two counters`);
				const diagonals = edges.filter(e => Math.abs(e.slope - sign * 0.6) < 0.001 && e.y > 735 * 0.2 && e.y < 735 * 0.8);
				const intercepts = diagonals.map(e => e.y - sign * 0.6 * e.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - connectionWidth) < 0.1
				)), `${slope} ${weight} ${name}: diagonal width matches the connection`);
			}
		}
	}
});

test("broken capital thorn keeps its counter and connection width", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Broken thorn QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: {
				"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
				"capital-thorn": "asymmetric-broken-falling-serifless",
			} },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Latin-Upper-Thorn",
			glyphIsNeeded: id => /^Thorn(?:\.|$)/.test(id),
		});
		assert.equal(para.variantSelector.Thorn, "asymmetricBrokenFallingSerifless");
		assert.deepEqual(
			straightEdges(glyphStore.queryByNameEnsured("Thorn")).contours,
			straightEdges(glyphStore.queryByNameEnsured("Thorn.asymmetricBrokenFallingSerifless")).contours
		);
		for (const symmetry of ["", "asymmetric"]) {
			const closed = straightEdges(glyphStore.queryByNameEnsured(`Thorn.${symmetry ? `${symmetry}Serifless` : "serifless"}`));
			const horizontal = closed.edges.filter(e => Math.abs(e.slope) < 0.001 && e.y > 0.1 && e.y < 735 * 0.5);
			const heights = [...new Set(horizontal.map(e => Math.round(e.y * 1000) / 1000))].sort((a, b) => a - b);
			assert.equal(heights.length, 2, `${slope} ${weight} ${symmetry}: horizontal connection`);
			const connectionWidth = heights[1] - heights[0];
			for (const [direction, sign] of [["Rising", 1], ["Falling", -1]]) {
				const name = `Thorn.${symmetry ? `${symmetry}Broken` : "broken"}${direction}Serifless`;
				const { contours, edges } = straightEdges(glyphStore.queryByNameEnsured(name));
				assert.equal(contours.length, 2, `${slope} ${weight} ${name}: one counter`);
				const diagonals = edges.filter(e => Math.abs(e.slope - sign * 0.6) < 0.001);
				const intercepts = diagonals.map(e => e.y - sign * 0.6 * e.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - connectionWidth) < 0.1
				)), `${slope} ${weight} ${name}: diagonal width matches the connection`);
			}
		}
	}
});

test("P and Komi de have selected broken bowls without changing R", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const makeFont = design => {
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Broken P QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", "capital-p": design } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => ["Letter-Latin-Upper-P", "Letter-Latin-Upper-R", "Letter-Cyrillic-Yeri", "Letter-Cyrillic-Upper-Komi-De-Dje"].includes(id),
				glyphIsNeeded: id => /^(?:P|R|cyrl\/DeKomi)(?:\.|$)/.test(id),
			});
			return { para, glyphStore };
		};
		const { para, glyphStore } = makeFont("broken-rising-serifless");
		const closed = makeFont("closed-serifless");
		assert.equal(para.variantSelector.P, "brokenRisingSerifless");
		assert.deepEqual(straightEdges(glyphStore.queryByNameEnsured("R")).contours, straightEdges(closed.glyphStore.queryByNameEnsured("R")).contours);
		for (const family of ["P", "cyrl/DeKomi"]) {
			const baseline = straightEdges(glyphStore.queryByNameEnsured(`${family}.closedSerifless`));
			const horizontal = baseline.edges.filter(e => Math.abs(e.slope) < 0.001 && e.y > 735 * 0.25 && e.y < 735 * 0.75);
			const heights = [...new Set(horizontal.map(e => Math.round(e.y * 1000) / 1000))].sort((a, b) => a - b);
			assert.equal(heights.length, 2, `${slope} ${weight} ${family}: horizontal connection`);
			const connectionWidth = heights[1] - heights[0];
			assert.deepEqual(
				straightEdges(glyphStore.queryByNameEnsured(family)).contours,
				straightEdges(glyphStore.queryByNameEnsured(`${family}.brokenRisingSerifless`)).contours
			);
			for (const [direction, sign] of [["Rising", 1], ["Falling", -1]]) {
				const name = `${family}.broken${direction}Serifless`;
				const { contours, edges } = straightEdges(glyphStore.queryByNameEnsured(name));
				assert.equal(contours.length, 2, `${slope} ${weight} ${name}: one counter`);
				const diagonals = edges.filter(e => Math.abs(e.slope - sign * 0.6) < 0.001);
				const intercepts = diagonals.map(e => e.y - sign * 0.6 * e.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - connectionWidth) < 0.1
				)), `${slope} ${weight} ${name}: diagonal width matches the connection`);
			}
		}
	}
});

test("staged yer diagonals retain the horizontal connection width", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Broken yer QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => id === "Letter-Cyrillic-Yeri",
			glyphIsNeeded: id => /^cyrl\/(?:Yeri|yeri)\./.test(id),
		});
		for (const family of ["cyrl/Yeri", "cyrl/yeri"]) {
			const baseline = straightEdges(glyphStore.queryByNameEnsured(`${family}.flatFlatSerifless`));
			const horizontal = baseline.edges.filter(e => Math.abs(e.slope) < 0.001 && e.y > 50 && e.y < (family.startsWith("cyrl/Y") ? 735 : 520) * 0.8);
			const heights = [...new Set(horizontal.map(e => Math.round(e.y * 1000) / 1000))].sort((a, b) => a - b);
			assert.ok(heights.length >= 2, `${slope} ${weight} ${family}: horizontal connection ${heights}`);
			const widths = heights.flatMap((a, i) => heights.slice(i + 1).map(b => b - a));
			for (const [direction, sign] of [["Rising", 1], ["Falling", -1]]) {
				const name = `${family}.broken${direction}FlatSerifless`;
				const { edges } = straightEdges(glyphStore.queryByNameEnsured(name));
				const diagonals = edges.filter(e => Math.abs(e.slope - sign * 0.6) < 0.001);
				const intercepts = diagonals.map(e => e.y - sign * 0.6 * e.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					widths.some(width => Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - width) < 0.1)
				)), `${slope} ${weight} ${name}: diagonal width matches the connection`);
			}
		}
	}
});

test("narrow yery diagonals retain the calculated stem stroke", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Broken yery QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless" } },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Yery"].includes(id),
			glyphIsNeeded: id => /^cyrl\/(?:Yery|yery)(?:Back)?\./.test(id),
		});
		for (const [family, top] of [["cyrl/Yery", 735], ["cyrl/yery", 520], ["cyrl/YeryBack", 735], ["cyrl/yeryBack", 520]]) {
			const closed = straightEdges(glyphStore.queryByNameEnsured(`${family}.flatFlatSeriflessISerifless`));
			const stem = closed.edges.filter(e => Math.abs(e.slope) < 0.001 && Math.abs(e.y - top) < 0.1)
				.sort((a, b) => Math.max(b.x, b.x + b.dx) - Math.max(a.x, a.x + a.dx))[0];
			assert.ok(stem, `${slope} ${weight} ${family}: I-stem top`);
			const angle = para.slopeAngle * Math.PI / 180;
			const width = Math.abs(stem.dx) / ((para.contrast ?? 1) * Math.cos(angle) + Math.sin(angle) * Math.tan(angle));
			for (const [direction, sign] of [["Rising", 1], ["Falling", -1]]) {
				const name = `${family}.broken${direction}FlatSeriflessISerifless`;
				const { edges } = straightEdges(glyphStore.queryByNameEnsured(name));
				const intercepts = edges.filter(e => Math.abs(e.slope - sign * 0.6) < 0.001).map(e => e.y - sign * 0.6 * e.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - width) < 0.1
				)), `${slope} ${weight} ${name}: diagonal width matches the calculated stroke`);
			}
		}
	}
});

test("capital Be and reversed Be select matching open and broken bowls", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		const para = makePara({
			shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
			menu: { family: "Broken Be QA", version: "34.9.0", width: 5, slope, weight: 400 },
			featureControl: { noCvSs: false, noLigation: true },
			variants: { design: {
				"capital-latin-gamma": "serifless", "latin-gamma": "serifless",
				"cyrl-capital-be": "broken-rising-serifless",
			} },
		});
		const { glyphStore } = buildGlyphs(para, {
			blockIsNeeded: id => ["Letter-Cyrillic-Yeri", "Letter-Cyrillic-Be"].includes(id),
			glyphIsNeeded: id => /^(?:cyrl\/(?:Be|revBe)|latn\/(?:Be|De))(?:\.|$)/.test(id),
		});
		for (const [family, alias] of [["cyrl/Be", "latn/Be"], ["cyrl/revBe", "latn/De"]]) {
			const closed = straightEdges(glyphStore.queryByNameEnsured(`${family}.serifless`));
			const heights = [...new Set(closed.edges.filter(e => Math.abs(e.slope) < 0.001 && e.y > 735 * 0.25 && e.y < 735 * 0.75).map(e => Math.round(e.y * 1000) / 1000))].sort((a, b) => a - b);
			assert.equal(heights.length, 2, `${slope} ${weight} ${family}`);
			assert.equal(straightEdges(glyphStore.queryByNameEnsured(`${family}.openSerifless`)).contours.length, 1);
			for (const [direction, sign] of [["Rising", 1], ["Falling", -1]]) {
				const name = `${family}.broken${direction}Serifless`;
				const { contours, edges } = straightEdges(glyphStore.queryByNameEnsured(name));
				assert.equal(contours.length, 2, `${slope} ${weight} ${name}`);
				const intercepts = edges.filter(e => Math.abs(e.slope - sign * 0.6) < 0.001).map(e => e.y - sign * 0.6 * e.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - (heights[1] - heights[0])) < 0.1
				)), `${slope} ${weight} ${name}: diagonal width matches the connection`);
			}
			assert.deepEqual(straightEdges(glyphStore.queryByNameEnsured(alias)).contours, straightEdges(glyphStore.queryByNameEnsured(`${family}.brokenRisingSerifless`)).contours);
		}
		assert.deepEqual(straightEdges(glyphStore.queryByNameEnsured("cyrl/Be")).contours, straightEdges(glyphStore.queryByNameEnsured("cyrl/Be.brokenRisingSerifless")).contours);
	}
});

test("lower Ve broken bowls follow their selectors in upright and Bulgarian forms", async () => {
	await Geometry.Init();
	const makePara = await getParametersT({ paramsDir: fileURLToPath(new URL("../../../params/", import.meta.url)) });
	for (const slope of ["upright", "italic"]) for (const weight of [120, 420, 920]) {
		for (const [body, key, normal, bulgarian] of [
			["standard", "standard-broken-rising-serifless", "standardBrokenRisingSerifless", "roundedTopBrokenRisingTall"],
			["rounded", "rounded-top-broken-rising-serifless", "roundedTopBrokenRisingSerifless", "roundedTopBrokenRisingTall"],
			["cursive", "cursive-broken-rising", "cursiveBrokenRising", "cursiveBrokenRisingTall"],
		]) for (const [from, to, sign] of [["rising", "rising", 1], ["rising", "falling", -1]]) {
			const variant = key.replace(from, to);
			const normalSuffix = normal.replace("Rising", sign > 0 ? "Rising" : "Falling");
			const bulgarianSuffix = bulgarian.replace("Rising", sign > 0 ? "Rising" : "Falling");
			const para = makePara({
				shape: { serifs: "sans", spacing: "term", weight, width: 500, slope, slopeAngle: slope === "italic" ? 9.4 : 0 },
				menu: { family: "Broken Ve QA", version: "34.9.0", width: 5, slope, weight: 400 },
				featureControl: { noCvSs: false, noLigation: true },
				variants: { design: { "capital-latin-gamma": "serifless", "latin-gamma": "serifless", "cyrl-ve": variant } },
			});
			const { glyphStore } = buildGlyphs(para, {
				blockIsNeeded: id => id === "Letter-Latin-Upper-B",
				glyphIsNeeded: id => /^(?:cyrl\/ve|smcpB)(?:\.|$)/.test(id),
			});
			for (const [name, suffix] of [["cyrl/ve", normalSuffix], ["cyrl/ve.BGR", bulgarianSuffix]]) {
				const selected = straightEdges(glyphStore.queryByNameEnsured(name));
				const expected = straightEdges(glyphStore.queryByNameEnsured(`smcpB.${suffix}`));
				assert.deepEqual(selected.contours, expected.contours, `${slope} ${weight} ${body} ${name}`);
				assert.equal(selected.contours.length, 3, `${slope} ${weight} ${body} ${name}: two counters`);
				const reference = straightEdges(glyphStore.queryByNameEnsured(`smcpB.${suffix.replace(/Broken(?:Rising|Falling)/, "")}`));
				const center = name.endsWith(".BGR") || suffix.endsWith("Tall") ? 750 : 520;
				const heights = [...new Set(reference.edges.filter(e => Math.abs(e.slope) < 0.001 && e.y > center * 0.15 && e.y < center * 0.8).map(e => Math.round(e.y * 1000) / 1000))].sort((a, b) => a - b);
				const widths = heights.flatMap((a, i) => heights.slice(i + 1).map(b => b - a));
				const intercepts = selected.edges.filter(e => Math.abs(e.slope - sign * 0.6) < 0.001).map(e => e.y - sign * 0.6 * e.x);
				assert.ok(intercepts.some((a, i) => intercepts.slice(i + 1).some(b =>
					widths.some(width => Math.abs(Math.abs(a - b) / Math.hypot(1, 0.6) - width) < 0.1)
				)), `${slope} ${weight} ${body} ${name}: diagonal width matches the connection`);
			}
		}
	}
});
