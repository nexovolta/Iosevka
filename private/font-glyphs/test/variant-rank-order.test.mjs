import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import * as Toml from "@iarna/toml";
import { parse } from "@iosevka/param/variant";

const text = readFileSync(new URL("../../../params/variants.toml", import.meta.url), "utf8");
const data = Toml.parse(text);

test("selector categories follow script order and all CV ranks are unique", () => {
	assert.doesNotMatch(text, /nonBreakingVariantAdditionPriority/);
	const parsed = parse(data);
	const keys = [...parsed.primes.keys()];
	const digits = new Set("zero one two three four five six seven eight nine digit-form".split(" "));
	const greek = new Set(("lower-alpha lower-beta capital-gamma lower-digamma lower-gamma " +
		"capital-delta lower-delta lower-zeta lower-eta capital-theta capital-o-bar lower-o-bar " +
		"lower-qoppa capital-qoppa lower-theta lower-iota lower-kappa capital-lambda lower-lambda " +
		"lower-mu lower-nu capital-xi lower-xi capital-pi capital-sigma lower-pi lower-rho " +
		"lower-sigma lower-final-sigma lower-tau lower-upsilon lower-phi lower-chi lower-psi " +
		"capital-psi capital-phi lower-omega capital-omega").split(" "));
	const punctuation = new Set(("tittle diacritic-dot diacritic-comma diacritic-line " +
		"punctuation-dot punctuation-comma ellipsis-density asterisk underscore section ascii-grave " +
		"ascii-single-quote paren brace guillemet number-sign ampersand at percent question pilcrow").split(" "));
	const symbols = new Set(("partial-derivative braille-dot tilde caret dollar cent bar sterling " +
		"micro-sign decorative-angle-brackets lig-ltgteq lig-neq lig-equal-chain lig-hyphen-chain " +
		"lig-plus-chain lig-double-arrow-bar lig-single-arrow-bar less-greater apl-form").split(" "));
	const category = key => {
		if (digits.has(key)) return 0;
		if (greek.has(key)) return 2;
		if (key.startsWith("cyrl-")) return 3;
		if (key.startsWith("armn-")) return 4;
		if (punctuation.has(key)) return 5;
		if (symbols.has(key)) return 6;
		return 1;
	};
	for (let i = 1; i < keys.length; i++) {
		assert.ok(category(keys[i - 1]) <= category(keys[i]), `${keys[i - 1]} before ${keys[i]}`);
	}
	const reverseData = { ...data, prime: Object.fromEntries(Object.entries(data.prime).reverse()) };
	const reversed = parse(reverseData);
	for (const [key, prime] of parsed.primes) {
		assert.equal(prime.tag, reversed.primes.get(key).tag, `${key}: tag changed with source order`);
		const ranks = [...prime.variants.values()].map(variant => variant.rank).filter(Boolean);
		assert.equal(new Set(ranks).size, ranks.length, `${key}: duplicate CV rank`);
	}
});

test("automatic ranks skip all explicit and reserved ranks in stage order", () => {
	const input = {
		default: {},
		prime: { example: {
			"variants-buildup": {
				entry: "body",
				reservedVariantRanks: [4],
				stages: { body: {
					first: { rank: 1, next: "END" },
					explicit: { rank: 2, next: "END", variantRank: 1 },
					last: { rank: 3, next: "END" },
				} },
			},
		} },
	};
	const ranks = parse(input).primes.get("example").variants;
	assert.equal(ranks.get("first").rank, 2);
	assert.equal(ranks.get("explicit").rank, 1);
	assert.equal(ranks.get("last").rank, 3);
	input.prime.example["variants-buildup"].stages.body.last.variantRank = 1;
	assert.throws(() => parse(input), /Duplicate variant rank 1/);
});
