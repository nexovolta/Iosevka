import assert from "node:assert/strict";
import { test } from "node:test";
import { getGrMesh, getGrTree } from "../src/relation.mjs";

test("variant trees retain all relations in cyclic multidimensional graphs", () => {
	const glyphs = new Map();
	const relations = [];
	for (const [tag, axis] of [["cv01", "i"], ["cv02", "r"]]) {
		for (let rank = 0; rank < 3; rank++) {
			relations.push({
				tag,
				rank,
				get(glyph) {
					return axis === "i" ? `${rank}:${glyph.r}` : `${glyph.i}:${rank}`;
				},
			});
		}
	}
	for (let i = 0; i < 3; i++) {
		for (let r = 0; r < 3; r++) glyphs.set(`${i}:${r}`, { i, r });
	}
	const tree = getGrTree("0:0", [{ query: () => relations }], id => glyphs.get(id));
	const links = new Set(tree.map(([gr, from, to]) => `${gr.tag}:${gr.rank}:${from}:${to}`));
	assert.equal(tree.length, 54);
	assert.equal(links.size, 54);
	assert.ok(links.has("cv01:2:1:2:2:2"));
	assert.ok(links.has("cv02:1:2:2:2:1"));
	assert.ok(links.has("cv01:0:0:0:0:0"));
});

test("variant trees preserve relation-set traversal order", () => {
	const dotless = { get: g => g.dotless };
	const cv = { get: g => g.cv };
	const glyphs = new Map([
		["base", { dotless: "dotless", cv: "alternate" }],
		["dotless", { cv: "dotless-alternate" }],
		["alternate", { dotless: "unreachable" }],
		["dotless-alternate", {}],
		["unreachable", {}],
	]);
	const tree = getGrTree(
		"base",
		[
			{ query: g => g.dotless ? [dotless] : [] },
			{ query: g => g.cv ? [cv] : [] },
		],
		id => glyphs.get(id),
	);
	assert.deepEqual(
		tree.map(([, from, to]) => [from, to]),
		[["base", "alternate"], ["base", "dotless"], ["dotless", "dotless-alternate"]],
	);
});

test("variant meshes combine features without combining values of the same feature", () => {
	const glyphs = new Map();
	function glyphId(i, r) {
		const id = `${i}:${r}`;
		if (!glyphs.has(id)) glyphs.set(id, { i, r });
		return id;
	}
	function relation(tag, rank, axis) {
		return {
			tag,
			rank,
			get(glyph) {
				if (!glyph || glyph[axis] === rank) return null;
				return axis === "i" ? glyphId(rank, glyph.r) : glyphId(glyph.i, rank);
			},
		};
	}
	const relations = [
		relation("cv01", 1, "i"),
		relation("cv01", 2, "i"),
		relation("cv02", 1, "r"),
		relation("cv02", 2, "r"),
		relation("cv02", 3, "r"),
	];
	const mesh = getGrMesh(
		[glyphId(0, 0)],
		{ query: () => relations },
		id => glyphs.get(id),
	);
	const links = new Set(
		mesh.map(([gr, from, to]) => `${gr.tag}:${gr.rank}:${from[0]}:${to[0]}`),
	);
	assert.equal(mesh.length, 17);
	assert.equal(links.size, 17);
	assert.ok(links.has("cv01:2:0:3:2:3"));
	assert.ok(links.has("cv02:3:2:0:2:3"));
});
