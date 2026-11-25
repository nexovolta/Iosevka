import fs from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { buildOtl } from "@iosevka/font-otl";

import { buildGlyphData, glyphPath } from "../../../packages/font/src/glyph-svg.mjs";

const defaultFeatures = {
	ccmp: 1,
	rlig: 1,
	liga: 1,
	clig: 1,
	calt: 1,
};

export default main;
async function main(argv) {
	const fontInfos = argv.fontInfos;
	const baseInfo = fontInfos.find(
		info =>
			info.menu.family === "Iosevka" &&
			info.shape.weight === 400 &&
			info.shape.slope === "upright",
	);
	if (!baseInfo) throw new Error("Could not find the regular upright Iosevka build plan.");

	const baseData = await buildGlyphData({
		...baseInfo,
		featureControl: { ...baseInfo.featureControl, noCvSs: true },
		paramsDir: argv.paramsDir,
	});
	const baseGsub = buildOtl(baseData.para, baseData.glyphStore).GSUB;
	const gsubFeaturesByTag = indexGsubFeatures(baseGsub);
	const baseGlyphStores = new Map([[baseInfo.name, baseData.glyphStore]]);
	const preparedTasks = [];
	const contexts = new Map();

	for (const taskId of argv.taskIds) {
		if (!taskId.endsWith(".light")) continue;
		const taskPath = path.join(argv.taskDir, `${taskId}.json`);
		const task = JSON.parse(await fs.readFile(taskPath, "utf8"));
		const frames = [];
		for (const frame of task.frames) {
			frames.push({
				frame,
				lines: prepareFrame(
					frame,
					fontInfos,
					baseData.glyphStore,
					baseGsub,
					gsubFeaturesByTag,
					contexts,
					{ ...task, id: taskId.slice(0, -".light".length) },
				),
			});
		}
		preparedTasks.push({
			id: taskId.slice(0, -".light".length),
			width: task.width,
			height: task.height,
			variants: task.variants,
			frames,
		});
	}

	for (const context of contexts.values()) {
		if (baseGlyphStores.has(context.info.name)) continue;
		const source = await buildGlyphData({
			...context.info,
			featureControl: { ...context.info.featureControl, noCvSs: true },
			paramsDir: argv.paramsDir,
		});
		baseGlyphStores.set(context.info.name, source.glyphStore);
	}
	await buildContextsInParallel(contexts, baseInfo, baseGlyphStores, argv.paramsDir);
	const glyphData = Object.fromEntries(
		[...contexts.entries()].map(([key, context]) => [key, context.glyphs]),
	);
	await fs.mkdir(argv.outputDir, { recursive: true });
	await renderTasksInParallel(preparedTasks, glyphData, argv.outputDir);
	return preparedTasks.map(task => task.id);
}

async function buildContextsInParallel(contexts, baseInfo, baseGlyphStores, paramsDir) {
	const pending = [];
	for (const context of contexts.values()) {
		const baseGlyphStore = baseGlyphStores.get(context.info.name);
		if (!baseGlyphStore)
			throw new Error(`Missing source glyph store for ${context.info.name}.`);
		if (context.info.name === baseInfo.name && !context.variants) {
			context.glyphs = Object.fromEntries(
				[...context.glyphNames].map(name => {
					const glyph = baseGlyphStore.queryByName(name);
					if (!glyph)
						throw new Error(`Missing source glyph ${name} for ${context.info.name}.`);
					return [name, { d: glyphPath(glyph), advanceWidth: glyph.advanceWidth }];
				}),
			);
			continue;
		}
		const sourceGlyphs = [...context.glyphNames].map(name => {
			const glyph = baseGlyphStore.queryByName(name);
			if (!glyph) throw new Error(`Missing source glyph ${name} for ${context.info.name}.`);
			return glyph;
		});
		if (!sourceGlyphs.length) {
			context.glyphs = {};
			continue;
		}
		const dependencyManager = sourceGlyphs[0]._m_dependencyManager;
		if (!dependencyManager)
			throw new Error(`Missing glyph dependencies for ${context.info.name}.`);
		const canonicalGlyphs = new Set(sourceGlyphs);
		let filter;
		for (;;) {
			filter = dependencyManager.traverseDependencies([...canonicalGlyphs]);
			const sizeBefore = canonicalGlyphs.size;
			// Forked glyphs can share an identifier with a different build's glyph object.
			for (const name of filter.glyphIdFilter) {
				const glyph = baseGlyphStore.queryByName(name);
				if (glyph) canonicalGlyphs.add(glyph);
			}
			if (canonicalGlyphs.size === sizeBefore) break;
		}
		pending.push({
			context,
			workerData: {
				fontInfo: {
					...context.info,
					featureControl: {
						...context.info.featureControl,
						noCvSs: true,
					},
					...(context.variants ? { variants: context.variants } : {}),
				},
				paramsDir,
				glyphNames: [...context.glyphNames],
				glyphIds: [...filter.glyphIdFilter],
				blockIds: [...filter.blockIdFilter],
			},
		});
	}

	let completed = 0;
	const concurrency = Math.min(4, pending.length);
	if (!concurrency) return;
	await runContextWorkerPool(pending, concurrency, () => {
		completed++;
		if (completed % 8 === 0 || completed === pending.length) {
			process.stdout.write(`Built ${completed}/${pending.length} direct glyph contexts.\n`);
		}
	});
}

function runContextWorkerPool(pending, concurrency, onComplete) {
	const workers = Array.from(
		{ length: concurrency },
		() => new Worker(new URL("./render-glyph-context.mjs", import.meta.url)),
	);
	return new Promise((resolve, reject) => {
		let next = 0;
		let completed = 0;
		let settled = false;
		const terminate = () => Promise.all(workers.map(worker => worker.terminate()));
		const fail = error => {
			if (settled) return;
			settled = true;
			terminate().finally(() => reject(error));
		};
		const finish = () => {
			if (settled || completed !== pending.length) return;
			settled = true;
			terminate().then(resolve, reject);
		};
		const dispatch = worker => {
			if (next >= pending.length) return;
			const index = next++;
			worker.postMessage({ index, workerData: pending[index].workerData });
		};
		for (const worker of workers) {
			worker.on("message", message => {
				if (message.error) {
					const item = pending[message.index];
					fail(
						new Error(
							`Failed glyph context ${JSON.stringify(item.workerData.fontInfo.variants)} (${item.workerData.fontInfo.name}): ${message.error}`,
						),
					);
					return;
				}
				pending[message.index].context.glyphs = message.glyphs;
				completed++;
				onComplete();
				if (completed === pending.length) finish();
				else dispatch(worker);
			});
			worker.once("error", fail);
			worker.once("exit", code => {
				if (!settled)
					fail(new Error(`Direct glyph context worker exited with code ${code}.`));
			});
			dispatch(worker);
		}
	});
}

async function renderTasksInParallel(tasks, contexts, outputDir) {
	const concurrency = Math.min(4, tasks.length);
	if (!concurrency) return;
	const chunkSize = Math.ceil(tasks.length / concurrency);
	const workers = [];
	for (let i = 0; i < tasks.length; i += chunkSize) {
		workers.push(
			runWorker("./render-svg-worker.mjs", {
				tasks: tasks.slice(i, i + chunkSize),
				contexts,
				outputDir,
			}),
		);
	}
	await Promise.all(workers);
}

function runWorker(name, data) {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL(name, import.meta.url), { workerData: data });
		let receivedMessage = false;
		worker.once("message", message => {
			receivedMessage = true;
			if (message.error) reject(new Error(message.error));
			else resolve(message);
		});
		worker.once("error", reject);
		worker.once("exit", code => {
			if (code !== 0 && !receivedMessage)
				reject(new Error(`Worker ${name} exited with code ${code}.`));
		});
	});
}

function prepareFrame(frame, fontInfos, baseGlyphStore, gsub, gsubFeaturesByTag, contexts, task) {
	const runs = [];
	flattenContent(frame.contents || [], {}, runs);
	const lines = [[]];
	for (const run of runs) {
		const info = chooseFontInfo(fontInfos, run.style);
		const contextKey = task.id.startsWith("cv-") ? `${info.name}\u0000${task.id}` : info.name;
		let context = contexts.get(contextKey);
		if (!context) {
			context = {
				info,
				glyphNames: new Set(),
				glyphs: null,
				variants: task.id.startsWith("cv-") ? task.variants : null,
			};
			contexts.set(contextKey, context);
		}
		const features = { ...defaultFeatures, ...(run.style["font-feature-settings"] || {}) };
		for (const part of run.text.split(/(\n)/)) {
			if (part === "\n") {
				lines.push([]);
				continue;
			}
			if (!part) continue;
			const tokens = [];
			for (const char of Array.from(part)) {
				const codePoint = char.codePointAt(0);
				const glyphName = baseGlyphStore.queryNameByUnicode(codePoint);
				if (!glyphName) {
					throw new Error(
						`No glyph for U+${codePoint.toString(16).toUpperCase()} while rendering a README sample.`,
					);
				}
				tokens.push({ name: glyphName, char, style: run.style, contextKey });
			}
			applyFeatures(tokens, gsub, gsubFeaturesByTag, features);
			for (const token of tokens) {
				context.glyphNames.add(token.name);
				lines[lines.length - 1].push(token);
			}
		}
	}
	return lines;
}

function flattenContent(items, inheritedStyle, output) {
	let style = { ...inheritedStyle };
	for (const item of items) {
		if (typeof item === "string") {
			if (item) output.push({ text: item, style });
		} else if (Array.isArray(item)) {
			flattenContent(item, style, output);
		} else if (item && typeof item === "object") {
			style = { ...style, ...item };
		}
	}
}

function chooseFontInfo(fontInfos, style) {
	const family = style["font-family"] || "Iosevka";
	const fontStyle = style["font-style"] || "normal";
	const weight = Number(style["font-weight"] || 400);
	const candidates = fontInfos.filter(info => info.menu.family === family);
	if (!candidates.length)
		throw new Error(`No direct glyph build plan for sample font ${family}.`);
	const matchingStyle = candidates.filter(info => info.css.style === fontStyle);
	const pool = matchingStyle.length ? matchingStyle : candidates;
	pool.sort((a, b) => Math.abs(a.css.weight - weight) - Math.abs(b.css.weight - weight));
	if (!matchingStyle.length && fontStyle !== "normal") {
		throw new Error(`No ${fontStyle} direct glyph build plan for sample font ${family}.`);
	}
	return pool[0];
}

function indexGsubFeatures(gsub) {
	const byTag = new Map();
	for (const feature of Object.values(gsub.features)) {
		if (!byTag.has(feature.tag)) byTag.set(feature.tag, []);
		byTag.get(feature.tag).push(feature);
	}
	return byTag;
}

function applyFeatures(tokens, gsub, featuresByTag, featureSettings) {
	for (const [tag, value] of Object.entries(featureSettings)) {
		if (value == null || value === 0 || value === "0") continue;
		for (const feature of featuresByTag.get(tag) || []) {
			for (const lookupRef of feature.lookups || []) {
				const name = typeof lookupRef === "string" ? lookupRef : lookupRef.name;
				const lookup = gsub.lookups[name];
				if (!lookup) throw new Error(`Missing GSUB lookup ${name}.`);
				applyLookup(lookup, tokens, Number(value), gsub);
			}
		}
	}
}

function applyLookup(lookup, tokens, featureValue, gsub, onlyIndex = null) {
	switch (lookup.type) {
		case "gsub_single":
			applyMappedSubstitution(lookup.substitutions, tokens, onlyIndex);
			break;
		case "gsub_multiple":
			applyMultipleSubstitution(lookup.substitutions, tokens, onlyIndex);
			break;
		case "gsub_alternate":
			applyAlternateSubstitution(lookup.substitutions, tokens, featureValue, onlyIndex);
			break;
		case "gsub_ligature":
			applyLigatureSubstitution(lookup.substitutions, tokens, onlyIndex);
			break;
		case "gsub_chaining":
			applyChainingSubstitution(lookup.rules, tokens, featureValue, gsub);
			break;
		case "gsub_reverse":
			applyReverseSubstitution(lookup.rules, tokens);
			break;
	}
}

function applyMappedSubstitution(substitutions, tokens, onlyIndex) {
	const start = onlyIndex == null ? 0 : onlyIndex;
	const end = onlyIndex == null ? tokens.length : onlyIndex + 1;
	for (let i = start; i < end; i++) {
		const replacement = substitutions[tokens[i]?.name];
		if (typeof replacement === "string") tokens[i].name = replacement;
	}
}

function applyMultipleSubstitution(substitutions, tokens, onlyIndex) {
	const start = onlyIndex == null ? tokens.length - 1 : onlyIndex;
	const end = onlyIndex == null ? -1 : onlyIndex - 1;
	const step = onlyIndex == null ? -1 : 1;
	for (let i = start; i !== end; i += step) {
		const replacement = substitutions[tokens[i]?.name];
		if (!Array.isArray(replacement)) continue;
		const original = tokens[i];
		tokens.splice(i, 1, ...replacement.map(name => ({ ...original, name })));
	}
}

function applyAlternateSubstitution(substitutions, tokens, featureValue, onlyIndex) {
	const index = Number.isFinite(featureValue) ? Math.max(0, featureValue - 1) : 0;
	const start = onlyIndex == null ? 0 : onlyIndex;
	const end = onlyIndex == null ? tokens.length : onlyIndex + 1;
	for (let i = start; i < end; i++) {
		const alternatives = substitutions[tokens[i]?.name];
		if (Array.isArray(alternatives) && alternatives[index])
			tokens[i].name = alternatives[index];
	}
}

function applyLigatureSubstitution(substitutions, tokens, onlyIndex) {
	const rules = [...substitutions].sort((a, b) => b.from.length - a.from.length);
	const start = onlyIndex == null ? 0 : onlyIndex;
	const end = onlyIndex == null ? tokens.length : onlyIndex + 1;
	for (let i = start; i < end; i++) {
		const rule = rules.find(candidate =>
			candidate.from.every((name, offset) => tokens[i + offset]?.name === name),
		);
		if (!rule) continue;
		const first = tokens[i];
		tokens.splice(i, rule.from.length, { ...first, name: rule.to });
	}
}

function applyChainingSubstitution(rules, tokens, featureValue, gsub) {
	for (let i = 0; i < tokens.length; i++) {
		for (const rule of rules) {
			const start = i - (rule.inputBegins || 0);
			if (!matchesRule(rule, tokens, start)) continue;
			for (const action of rule.apply || []) {
				const position = start + action.at;
				const lookupName =
					typeof action.lookup === "string" ? action.lookup : action.lookup.name;
				const lookup = gsub.lookups[lookupName];
				if (!lookup) throw new Error(`Missing contextual GSUB lookup ${lookupName}.`);
				applyLookup(lookup, tokens, featureValue, gsub, position);
			}
		}
	}
}

function applyReverseSubstitution(rules, tokens) {
	for (let i = tokens.length - 1; i >= 0; i--) {
		for (const rule of rules) {
			const start = i - (rule.inputIndex || 0);
			if (!matchesRule(rule, tokens, start)) continue;
			const replacement = rule.to?.[rule.inputIndex || 0];
			if (replacement) {
				tokens[i].name = replacement;
				break;
			}
		}
	}
}

function matchesRule(rule, tokens, start) {
	if (start < 0 || start + rule.match.length > tokens.length) return false;
	return rule.match.every(
		(candidates, offset) =>
			!candidates.length || candidates.includes(tokens[start + offset].name),
	);
}
