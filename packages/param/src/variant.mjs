import { joinCamel } from "@iosevka/util";

export function apply(data, para, argv) {
	const parsed = parse(data, argv);
	const tagSet = new Set();
	for (const prime of parsed.primes.values()) {
		if (!prime.tag) continue;
		if (!tagSet.has(prime.tag)) tagSet.add(prime.tag);
		else throw new Error(`CV tag conflict: ${prime.tag}`);
	}
	const variantSelector = resolveSelectors(parsed, para, argv);
	applyForcedDoubleStoreyAFromUprightOblique(parsed, para, argv, variantSelector);
	para.variants = {
		selectorTree: parsed.selectorTree,
		primes: parsed.primes,
		composites: parsed.composites,
	};
	para.variantSelector = variantSelector;
}

export function parse(data, argv) {
	const primes = new Map();
	const selectorTree = new SelectorTree();
	for (const k in data.prime) {
		const p = new Prime(k, data.prime[k]);
		primes.set(k, p);
	}
	assignOpenTypeTags(primes, data["reserved-letter-append-orders"] || []);
	for (const p of primes.values()) p.register(selectorTree);
	const defaultComposite = new Composite("{default}", data.default);
	const composites = new Map();
	for (const k in data.composite) {
		const comp = new Composite(k, data.composite[k]);
		composites.set(k, comp);
	}
	if (argv?.variantCompositesFromBuildPlan) {
		for (const k in argv.variantCompositesFromBuildPlan) {
			const key = `buildPlans.${k}`;
			const comp = new Composite(key, argv.variantCompositesFromBuildPlan[k]);
			composites.set(key, comp);
		}
	}
	return { selectorTree: selectorTree, primes, composites, defaultComposite };
}

const LIGATURE_A_SELECTORS = ["ae/a", "ao/a", "au/a", "av/a", "ay/a", "cyrl/aye/a"];

function resolveSelectors(parsed, para, argv) {
	const variantSelector = {};
	parsed.defaultComposite.resolve(para, parsed.selectorTree, parsed.composites, variantSelector);
	if (argv.shape.serifs === "slab") {
		const slabComp = parsed.composites.get("slab");
		slabComp.resolve(para, parsed.selectorTree, parsed.composites, variantSelector);
	}
	if (argv.variants) {
		const userComposite = new Composite("{user}", argv.variants);
		userComposite.resolve(para, parsed.selectorTree, parsed.composites, variantSelector);
	}
	return variantSelector;
}

function applyForcedDoubleStoreyAFromUprightOblique(parsed, para, argv, variantSelector) {
	const obliqueVs = resolveSelectors(
		parsed,
		Object.assign({}, para, { isItalic: false, isOblique: true }),
		argv,
	);
	const uprightVs = resolveSelectors(
		parsed,
		Object.assign({}, para, { isItalic: false, isOblique: false }),
		argv,
	);
	const source =
		[variantSelector, obliqueVs, uprightVs].find(vs => vs.a?.startsWith("doubleStorey")) ||
		variantSelector;
	for (const selector of [
		"a/doubleStorey",
		"aHalf",
		"aRetroflexHook/doubleStorey",
		...LIGATURE_A_SELECTORS,
	]) {
		variantSelector[selector] = source[selector];
	}
}

class SelectorTree {
	constructor() {
		this.m_mapping = new Map();
	}
	get(kPrime, kVariant) {
		if (!this.m_mapping.has(kPrime)) return undefined;
		return this.m_mapping.get(kPrime).get(kVariant);
	}
	set(kPrime, kVariant, prime, variant) {
		if (!this.m_mapping.has(kPrime)) this.m_mapping.set(kPrime, new Map());
		this.m_mapping.get(kPrime).set(kVariant, [prime, variant]);
	}
	*[Symbol.iterator]() {
		for (const m of this.m_mapping.values()) yield* m.values();
	}
}

const DIGIT_ORDER = [
	"zero",
	"one",
	"two",
	"three",
	"four",
	"five",
	"six",
	"seven",
	"eight",
	"nine",
];

const GREEK_CAPITALS = new Set(["capital-gamma", "capital-delta", "capital-lambda"]);
const GREEK_LOWERS = new Set([
	"lower-alpha",
	"lower-beta",
	"lower-gamma",
	"lower-delta",
	"lower-zeta",
	"lower-eta",
	"lower-theta",
	"lower-iota",
	"lower-kappa",
	"lower-lambda",
	"lower-mu",
	"lower-nu",
	"lower-xi",
	"lower-pi",
	"lower-rho",
	"lower-final-sigma",
	"lower-tau",
	"lower-upsilon",
	"lower-phi",
	"lower-chi",
	"lower-psi",
]);

function compareByKey(a, b) {
	return a.key.localeCompare(b.key, "en");
}

function classifyLetter(key) {
	if (key === "partial-derivative") return { script: 1, name: "", capital: 1, trailing: 1 };
	if (key.startsWith("cyrl-")) {
		const capital = key.startsWith("cyrl-capital-");
		const name = capital ? key.slice("cyrl-capital-".length) : key.slice("cyrl-".length);
		return { script: 2, name, capital: capital ? 0 : 1, trailing: 0 };
	}
	if (GREEK_CAPITALS.has(key)) {
		return { script: 1, name: key.slice("capital-".length), capital: 0, trailing: 0 };
	}
	if (GREEK_LOWERS.has(key)) {
		return { script: 1, name: key.slice("lower-".length), capital: 1, trailing: 0 };
	}
	if (key.startsWith("capital-")) {
		return { script: 0, name: key.slice("capital-".length), capital: 0, trailing: 0 };
	}
	if (key.startsWith("lower-")) {
		return { script: 0, name: key.slice("lower-".length), capital: 1, trailing: 0 };
	}
	return { script: 0, name: key, capital: 1, trailing: 0 };
}

function compareLetters(a, b) {
	const ca = classifyLetter(a.key);
	const cb = classifyLetter(b.key);
	if (ca.script !== cb.script) return ca.script - cb.script;
	if (ca.trailing !== cb.trailing) return ca.trailing - cb.trailing;
	const nameCmp = ca.name.localeCompare(cb.name, "en");
	if (nameCmp !== 0) return nameCmp;
	return ca.capital - cb.capital;
}

// 0 => AA, 1 => AB, ... 25 => AZ, 26 => BA.
function mapNumberToLetter(n) {
	const lo = n % 26;
	const hi = Math.floor(n / 26);
	return String.fromCharCode(0x41 + hi) + String.fromCharCode(0x41 + lo);
}

function assignOpenTypeTags(primes, reservedLetterAppendOrders) {
	const digits = [];
	const letters = [];
	const symbols = [];
	const other = [];
	const appendedLetters = []; // Add new letter features without renumbering existing tags.
	for (const prime of primes.values()) {
		if (!prime.tagKind) continue;
		if (prime.tagKind === "digit") digits.push(prime);
		else if (prime.tagKind === "letter") letters.push(prime);
		else if (prime.tagKind === "letter-append") appendedLetters.push(prime);
		else if (prime.tagKind === "symbol") symbols.push(prime);
		else other.push(prime);
	}
	digits.sort((a, b) => DIGIT_ORDER.indexOf(a.key) - DIGIT_ORDER.indexOf(b.key));
	letters.sort(compareLetters);
	symbols.sort(compareByKey);
	other.sort(compareByKey);
	appendedLetters.sort((a, b) => a.tagOrder - b.tagOrder || compareLetters(a, b));
	const reservedOrders = [...reservedLetterAppendOrders].sort((a, b) => a - b);
	for (const [index, order] of reservedOrders.entries()) {
		if (
			!Number.isInteger(order) ||
			order < 0 ||
			(index && order === reservedOrders[index - 1])
		) {
			throw new Error(`Invalid reserved letter-append order: ${order}`);
		}
		if (appendedLetters.some(prime => prime.tagOrder === order)) {
			throw new Error(`Reserved letter-append order already in use: ${order}`);
		}
	}

	const cvPrimes = [...digits, ...letters];
	const overflow = [];
	let cvCount = 1;
	for (const prime of cvPrimes) {
		if (cvCount <= 99) prime.assignTag(`cv${String(cvCount++).padStart(2, "0")}`);
		else overflow.push(prime);
	}
	let vxCount = 0;
	for (const prime of [...symbols, ...other, ...overflow]) {
		prime.assignTag(`VX${mapNumberToLetter(vxCount++)}`);
	}
	let reservedIndex = 0;
	for (const prime of appendedLetters) {
		while (
			reservedIndex < reservedOrders.length &&
			reservedOrders[reservedIndex] < prime.tagOrder
		) {
			vxCount++;
			reservedIndex++;
		}
		prime.assignTag(`VX${mapNumberToLetter(vxCount++)}`);
	}
}

class Prime {
	constructor(key, cfg) {
		this.key = key;
		this.tag = null;
		this.tagKind = cfg.tagKind || null;
		this.tagOrder = cfg.tagOrder || 0;
		this.sampler = cfg.sampler;
		this.samplerExplain = cfg.samplerExplain;

		this.isSpecial = cfg.isSpecial || false;
		this.description = cfg.description || null;
		this.ligatureSampler = / /.test(cfg.sampler || "");
		this.descSampleText = this.ligatureSampler
			? cfg.sampler.split(" ").filter(x => !!x.trim())
			: [...(cfg.sampler || "")];

		this.slopeDependent = !!cfg.slopeDependent;
		this.hotChars = cfg.hotChars ? [...cfg.hotChars] : this.descSampleText;

		this.cherryPicking = cfg.cherryPicking;

		this.variants = new Map();

		let variantConfig = cfg.variants;
		if (!variantConfig && cfg["variants-buildup"]) {
			const vb = new VariantBuilder(cfg["variants-buildup"]);
			variantConfig = vb.process();
		}
		if (!variantConfig) throw new Error(`Missing variants in ${key}`);
		if (cfg["variants-extra-buildup"]) {
			const extra = new VariantBuilder(cfg["variants-extra-buildup"]).process();
			const ranks = new Set(Object.values(variantConfig).map(variant => variant.rank));
			const keys = new Set(Object.keys(variantConfig));
			variantConfig = { ...variantConfig };
			for (const [extraKey, variant] of Object.entries(extra)) {
				if (keys.has(extraKey)) {
					throw new Error(`Duplicate variant ${key}.${extraKey}`);
				}
				if (ranks.has(variant.rank))
					throw new Error(`Duplicate variant rank ${key}.${variant.rank}`);
				ranks.add(variant.rank);
				keys.add(extraKey);
				variantConfig[extraKey] = variant;
			}
		}
		for (const varKey in variantConfig) {
			const variant = variantConfig[varKey];
			this.variants.set(varKey, new PrimeVariant(varKey, this.tag, variant));
		}
	}
	assignTag(tag) {
		this.tag = tag;
		for (const variant of this.variants.values()) variant.tag = tag;
	}
	register(tree) {
		for (const [k, v] of this.variants) tree.set(this.key, k, this, v);
		if (this.tag) {
			for (const v of this.variants.values()) if (v.rank) tree.set(this.tag, v.rank, this, v);
		}
	}
	toJson() {
		const gr = {
			key: this.key,
			sampler: this.sampler,
			samplerExplain: this.samplerExplain,
			isSpecial: this.isSpecial,
			description: this.description,
			tag: this.tag,
			slopeDependent: this.slopeDependent,
			ligatureSampler: this.ligatureSampler,
			descSampleText: this.descSampleText,
			hotChars: this.hotChars,
			variants: [],
		};
		for (const variant of this.variants.values()) {
			gr.variants.push({
				key: variant.key,
				rank: variant.rank,
				groupRank: variant.groupRank,
				description: variant.description,
				snapshotFeatureApplication: variant.snapshotFeatureApplication,
			});
		}
		gr.variants.sort((a, b) => (a.rank || 0x7fffffff) - (b.rank || 0x7fffffff));
		return gr;
	}
}

export class PrimeVariant {
	constructor(key, tag, cfg) {
		this.key = key;
		this.tag = tag;
		this.description = cfg.description;
		this.rank = cfg.rank;
		this.groupRank = cfg.groupRank || 0;
		this.selector = cfg.selector;
		this.nonDeriving = cfg.nonDeriving;
		this.snapshotFeatureApplication = cfg.snapshotFeatureApplication;
	}
	resolveFor(para, gn) {
		const vs = {};
		this.resolve(para, vs);
		return vs[gn];
	}
	resolve(_para, vs) {
		Object.assign(vs, this.selector);
	}

	// Gr methods
	get(glyph) {
		if (glyph?.related?.cv) return glyph.related.cv.get(this);
		else return null;
	}
	set(glyph, toGid) {
		if (typeof toGid !== "string") throw new Error("Must supply a GID instead of a glyph");
		if (!glyph.related) glyph.related = {};
		if (!glyph.related.cv) glyph.related.cv = new Map();
		glyph.related.cv.set(this, toGid);
	}
	getPreventDeriving(glyph) {
		return glyph.related?.preventCvDeriving && !!glyph.related.preventCvDeriving.has(this);
	}
	setPreventDeriving(glyph) {
		if (!glyph.related) glyph.related = {};
		if (!glyph.related.preventCvDeriving) glyph.related.preventCvDeriving = new Set();
		glyph.related.preventCvDeriving.add(this);
	}
	amendName(name) {
		return `${name}.${this.tag}-${this.rank}`;
	}
	amendOtName(name) {
		return this.amendName(name);
	}
}

class Composite {
	constructor(key, cfg) {
		this.key = key;
		this.tag = cfg.tag;
		this.description = cfg.description;
		this.inherits = cfg.inherits;
		this.design = cfg.design;
		this.upright = cfg.upright || cfg["upright-oblique"];
		this.oblique = cfg.oblique || cfg["upright-oblique"];
		this.italic = cfg.italic;
		const slabOverrideCfg = cfg["slab-override"] || {};
		this.slabOverride = {
			design: slabOverrideCfg.design,
			override: slabOverrideCfg.upright || slabOverrideCfg["upright-oblique"],
			oblique: slabOverrideCfg.oblique || slabOverrideCfg["upright-oblique"],
			italic: slabOverrideCfg.italic,
		};
	}
	decompose(para, selTree) {
		const ans = [];
		const cfg = Object.assign(
			{},
			this.design,
			this.decomposeSlope(this, para),
			!para.slab ? {} : this.slabOverride.design,
			!para.slab ? {} : this.decomposeSlope(this.slabOverride, para),
		);
		for (const [k, v] of Object.entries(cfg)) {
			const pv = selTree.get(k, v);
			if (!pv) throw new Error(`Composite ${this.key} cannot be resolved: ${[k, v]}.`);
			ans.push(pv);
		}
		return ans;
	}
	decomposeSlope(base, para) {
		return para.isItalic ? base.italic : para.isOblique ? base.oblique : base.upright;
	}
	resolve(para, selTree, catalog, vs) {
		if (this.inherits) {
			if (!catalog.has(this.inherits)) {
				throw new Error(`Cannot find composite variant: ${this.inherits}`);
			}
			catalog.get(this.inherits).resolve(para, selTree, catalog, vs);
		}
		for (const [_prime, variant] of this.decompose(para, selTree)) {
			variant.resolve(para, vs);
		}
	}
}

///////////////////////////////////////////////////////////////////////////////////////////////////
///
/// Systematic Variant Building
///

class VariantBuilder {
	constructor(cfg) {
		this.entry = cfg.entry;
		this.descriptionLeader = cfg.descriptionLeader;
		this.rankOffset = cfg.rankOffset ?? 0;
		if (!Number.isInteger(this.rankOffset) || this.rankOffset < 0) {
			throw new Error("Variant rank offset must be a non-negative integer");
		}
		const reserved = cfg.reservedVariantRanks ?? [];
		if (
			!Array.isArray(reserved) ||
			reserved.some(rank => !Number.isInteger(rank) || rank < 1)
		) {
			throw new Error("Reserved variant ranks must be positive integers");
		}
		this.reservedVariantRanks = new Set(reserved);
		if (this.reservedVariantRanks.size !== reserved.length) {
			throw new Error("Duplicate reserved variant rank");
		}
		this.stages = new Map();
		for (const [key, stage] of Object.entries(cfg.stages)) {
			this.stages.set(key, new VbStage(key, stage));
		}
	}
	process() {
		const globalState = new VbGlobalState(this.entry, this.stages);
		const localState = new VbLocalState();
		localState.descriptionLeader = this.descriptionLeader;

		globalState.stages.get(this.entry).accept(globalState, localState);

		const claimedRanks = new Set(this.reservedVariantRanks);
		for (const item of globalState.sink) {
			if (item.variantRank == null) continue;
			if (this.reservedVariantRanks.has(item.variantRank))
				throw new Error(`Variant rank ${item.variantRank} is reserved`);
			if (claimedRanks.has(item.variantRank))
				throw new Error(`Duplicate variant rank ${item.variantRank}`);
			claimedRanks.add(item.variantRank);
		}

		const ans = {};
		let itemRank = this.rankOffset;
		for (const item of globalState.sink) {
			const cfg = item.createPrimeVariant();
			if (item.variantRank != null) {
				cfg.rank = item.variantRank;
			} else {
				do itemRank++;
				while (claimedRanks.has(itemRank));
				cfg.rank = itemRank;
				claimedRanks.add(itemRank);
			}
			if (!cfg.key) throw new Error("Invalid variant key");
			if (ans[cfg.key]) throw new Error(`Duplicate variant : ${cfg.key}`);
			ans[cfg.key] = cfg;
		}
		return ans;
	}
}

class VbStage {
	constructor(stage, raw) {
		this.stage = stage;
		this.defaultAlternative = new VbStageAlternative(this.stage, "*", {});
		this.alternatives = new Map();
		for (const k in raw) {
			if (k === "*") {
				this.defaultAlternative = new VbStageAlternative(this.stage, "*", raw[k]);
			} else {
				this.alternatives.set(k, new VbStageAlternative(this.stage, k, raw[k]));
			}
		}

		for (const v of this.alternatives.values()) v.fallback(this.defaultAlternative);
	}
	accept(globalState, localState) {
		const variantList = Array.from(this.alternatives.values());
		variantList.sort((a, b) => (a.rank || 0) - (b.rank || 0));
		for (const v of variantList) {
			const ans = v.tryAccept(globalState, localState);
			if (ans) globalState.stages.get(ans.stage).accept(globalState, ans);
		}
	}
}

class VbStageAlternative {
	constructor(stage, key, raw) {
		this.stage = stage;
		this.key = key;
		this.rank = raw.rank;
		this.groupRank = raw.groupRank;
		this.next = raw.next;
		this.mode = raw.mode;
		this.enableIf = raw.enableIf;
		this.disableIf = raw.disableIf;
		this.variantRank = raw.variantRank;
		if (key !== "*") this.keyAffix = raw.keyAffix ?? key;
		this.descriptionAffix = raw.descriptionAffix;
		this.descriptionJoiner = raw.descriptionJoiner || "with";
		this.selectorAffix = raw.selectorAffix;
	}
	fallback(defaultAlternative) {
		this.next = this.next || defaultAlternative.next;
		this.mode = this.mode || defaultAlternative.mode || "append";
		this.keyAffix = this.keyAffix || defaultAlternative.keyAffix;
		this.descriptionAffix = this.descriptionAffix || defaultAlternative.descriptionAffix;
		this.descriptionJoiner = this.descriptionJoiner || defaultAlternative.descriptionJoiner;
	}

	tryAccept(globalState, localState) {
		// Reject if disable conditions match
		if (this.enableIf && !this.evalCondition(this.enableIf, localState)) return null;
		if (this.disableIf && this.evalCondition(this.disableIf, localState)) return null;

		// Accept this alternative.
		const ans = localState.clone();
		ans.stage = this.next;
		ans.assignments.set(this.stage, this.key);
		if (this.variantRank != null) {
			ans.variantRank = this.evalVariantRank(this.variantRank, localState);
		}

		// RankGroup
		if (this.groupRank) ans.groupRank += this.evalValue(this.groupRank, localState);
		else if (this.stage === globalState.entry) ans.groupRank += this.rank;

		if (this.keyAffix) ans.addKeyAffix(this.mode, this.evalValue(this.keyAffix, localState));
		if (this.descriptionJoiner && this.descriptionAffix) {
			ans.addDescription(
				this.mode,
				this.evalValue(this.descriptionJoiner, localState),
				this.evalValue(this.descriptionAffix, localState),
			);
		}
		if (this.selectorAffix) {
			for (const [selector, suffix] of Object.entries(this.selectorAffix))
				ans.addSelectorAffix(this.mode, selector, this.evalValue(suffix, localState));
		}

		if (!this.next || this.next === "END") {
			ans.rank = ++globalState.rank;
			globalState.sink.push(ans);
			return null;
		} else {
			return ans;
		}
	}

	evalValue(expr, localState) {
		if (typeof expr === "number") return expr;
		if (typeof expr === "string") return expr;
		if (expr.if) {
			const condition = this.evalCondition(expr.if, localState);
			if (condition) {
				return this.evalValue(expr.then, localState);
			} else {
				return this.evalValue(expr.else, localState);
			}
		}
		throw new Error(`Invalid value expression: ${expr}`);
	}

	evalVariantRank(expr, localState) {
		if (Number.isInteger(expr)) return expr;
		if (!expr || typeof expr !== "object") {
			throw new Error(`Invalid variant rank expression: ${expr}`);
		}
		const entries = Object.entries(expr);
		if (entries.length !== 1) {
			throw new Error(`Invalid variant rank expression: ${expr}`);
		}
		const [stage, ranks] = entries[0];
		const choice = localState.assignments.get(stage);
		const rank = ranks?.[choice];
		if (!Number.isInteger(rank) || rank < 1) {
			throw new Error(`Missing variant rank for ${stage}.${choice}`);
		}
		return rank;
	}

	evalCondition(expr, localState) {
		if (!expr) return false;

		for (const branch of expr) {
			let statementMatches = true;
			for (let [k, v] of Object.entries(branch)) {
				v = v.trim();
				if (/^NOT(?=\s)/.test(v)) {
					v = v.slice(3).trim();
					if (localState.assignments.get(k) === v) {
						statementMatches = false;
						break;
					}
				} else {
					if (localState.assignments.get(k) !== v) {
						statementMatches = false;
						break;
					}
				}
			}
			if (statementMatches) return true;
		}
		return false;
	}
}

class VbGlobalState {
	constructor(entry, stages) {
		this.entry = entry;
		this.stages = stages;
		this.rank = 0;
		this.sink = [];
	}
}

class VbLocalState {
	constructor() {
		this.stage = ".start";
		this.rank = 0;
		this.variantRank = null;
		this.groupRank = 0;
		this.descriptionLeader = "";

		this.assignments = new Map();
		this.key = [];
		this.descriptions = new Map();
		this.selector = new Map();
	}

	clone() {
		const ans = new VbLocalState();
		ans.stage = this.stage;
		ans.rank = this.rank;
		ans.variantRank = this.variantRank;
		ans.groupRank = this.groupRank;
		ans.descriptionLeader = this.descriptionLeader;
		ans.assignments = new Map(this.assignments);
		ans.key = [...this.key];
		ans.selector = new Map(this.selector);
		ans.descriptions = new Map();
		for (const [k, v] of this.descriptions) ans.descriptions.set(k, [...v]);
		return ans;
	}

	addKeyAffix(mode, segment) {
		switch (mode) {
			case "append":
				this.key.push(segment);
				return;
			case "prepend":
				this.key.unshift(segment);
				return;
			case "replace":
				this.key = [segment];
				return;
			default:
				throw new Error(`Invalid key affix mode: ${mode}`);
		}
	}

	addDescription(mode, joiner, segment) {
		if (!segment) return;
		if (!this.descriptions.has(joiner)) this.descriptions.set(joiner, []);

		const descriptionSentence = this.descriptions.get(joiner);
		switch (mode) {
			case "append":
				descriptionSentence.push(segment);
				return;
			case "prepend":
				descriptionSentence.unshift(segment);
				return;
			case "replace":
				descriptionSentence.length = 0;
				descriptionSentence.push(segment);
				return;
			default:
				throw new Error(`Invalid description affix mode: ${mode}`);
		}
	}
	addSelectorAffix(mode, selector, value) {
		switch (mode) {
			case "append":
				this.selector.set(selector, joinCamel(this.selector.get(selector), value));
				return;
			case "prepend":
				this.selector.set(selector, joinCamel(value, this.selector.get(selector)));
				return;
			case "replace":
				this.selector.set(selector, value);
				return;
			default:
				throw new Error(`Invalid selector affix mode: ${mode}`);
		}
	}

	produceKey() {
		return this.key.join("-");
	}
	produceDescription() {
		const desc = [];
		for (const [joiner, segments] of this.descriptions) {
			if (!segments.length) continue;
			desc.push(`${joiner} ${arrayToSentence(segments)}`);
		}
		return `${this.descriptionLeader} ${desc.join("; ")}`;
	}

	createPrimeVariant() {
		return {
			key: this.produceKey(),
			rank: this.rank,
			variantRank: this.variantRank,
			groupRank: this.groupRank,
			description: this.produceDescription(),
			selector: Object.fromEntries(this.selector),
		};
	}
}

function arrayToSentence(arr) {
	if (arr.length === 1) return arr[0];
	const last = arr.pop();
	return `${arr.join(", ")}, and ${last}`;
}
