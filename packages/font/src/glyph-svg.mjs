import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geom from "@iosevka/geometry";
import { createGrDisplaySheet } from "@iosevka/glyph/relation";

import { getParametersT } from "./param/index.mjs";

export async function buildGlyphData(argv, recursiveBuildFilter, includeAutoBuilds = false) {
	await Geom.Init();
	const paraT = await getParametersT(argv);
	const para = paraT(argv);
	const { glyphStore, fontMetrics } = buildGlyphs(para, recursiveBuildFilter, includeAutoBuilds);
	return { para, glyphStore, fontMetrics };
}

export function createCharMap(glyphStore) {
	const charMap = [];
	for (const [name] of glyphStore.namedEntries()) {
		charMap.push([
			name,
			Array.from(glyphStore.queryUnicodeOfName(name) || []),
			...createGrDisplaySheet(glyphStore, name),
		]);
	}
	return charMap;
}

export function glyphPath(glyph) {
	const contours = glyph.geometry.toBezArcs();
	const paths = [];
	for (const contour of contours) {
		if (!contour.length) continue;
		const commands = [`M${point(contour[0].a)}`];
		for (const arc of contour) {
			commands.push(`C${point(arc.b)} ${point(arc.c)} ${point(arc.d)}`);
		}
		commands.push("Z");
		paths.push(commands.join(""));
	}
	return paths.join("");
}

export function glyphSvg(glyph, { title = "", fill = "currentColor" } = {}) {
	const contours = glyph.geometry.toBezArcs();
	const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	for (const contour of contours) {
		for (const arc of contour) {
			for (const p of [arc.a, arc.b, arc.c, arc.d]) {
				bounds.minX = Math.min(bounds.minX, p.x);
				bounds.minY = Math.min(bounds.minY, p.y);
				bounds.maxX = Math.max(bounds.maxX, p.x);
				bounds.maxY = Math.max(bounds.maxY, p.y);
			}
		}
	}
	if (!Number.isFinite(bounds.minX)) {
		bounds.minX = 0;
		bounds.minY = 0;
		bounds.maxX = glyph.advanceWidth;
		bounds.maxY = 0;
	}
	const padding = 24;
	const width = Math.max(1, bounds.maxX - bounds.minX + 2 * padding);
	const height = Math.max(1, bounds.maxY - bounds.minY + 2 * padding);
	const viewBox = `${format(bounds.minX - padding)} ${format(-bounds.maxY - padding)} ${format(width)} ${format(height)}`;
	const svgTitle = title ? `<title>${escapeXml(title)}</title>` : "";
	const d = glyphPath(glyph);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${format(width)}" height="${format(height)}" viewBox="${viewBox}">${svgTitle}<g transform="scale(1,-1)"><path d="${d}" fill="${escapeXml(fill)}" fill-rule="nonzero"/></g></svg>`;
}

function point(p) {
	return `${format(p.x)} ${format(p.y)}`;
}

function format(n) {
	const rounded = Math.round(n * 1000) / 1000;
	return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(s) {
	return s
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
