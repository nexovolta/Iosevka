import assert from "node:assert/strict";
import { test } from "node:test";
import { getGrMesh } from "../src/relation.mjs";

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
