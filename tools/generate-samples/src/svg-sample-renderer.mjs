export function renderSampleSvg(task, contexts, theme) {
	const width = Number(task.width);
	const height = Number(task.height);
	const prefix = safeId(task.id);
	const paths = new Map();
	const frameMarkup = [];

	for (const { frame, lines } of task.frames) {
		const box = frameBox(frame, width, height);
		const wrappedLines = wrapLines(lines, box.width, contexts);
		const lineHeight = lineHeightOf(frame, wrappedLines);
		const totalHeight = wrappedLines.length
			? (wrappedLines.length - 1) * lineHeight + maxFontSize(wrappedLines)
			: 0;
		const baselineOffset = Number(frame["baseline-offset"] ?? 0.8);
		const firstFontSize = maxFontSize(wrappedLines);
		const firstBaseline =
			box.top + Math.max(0, (box.height - totalHeight) / 2) + firstFontSize * baselineOffset;
		for (const [lineIndex, line] of wrappedLines.entries()) {
			const lineWidth = measureLine(line, contexts);
			let x = box.left;
			if (frame["horizontal-align"] === "center") x += (box.width - lineWidth) / 2;
			else if (frame["horizontal-align"] === "right") x += box.width - lineWidth;
			const baseline = firstBaseline + lineIndex * lineHeight;
			for (const token of line) {
				const glyph = queryGlyph(token, contexts);
				const fontSize = fontSizeOf(token.style);
				const scale = fontSize / 1000;
				const pathKey = `${token.contextKey}\u0000${token.name}`;
				let path = paths.get(pathKey);
				if (!path) {
					path = { id: `${prefix}-g${paths.size}`, d: glyph.d };
					paths.set(pathKey, path);
				}
				const [fill, opacity] = colorOf(token.style.color, theme);
				if (glyph.d) {
					frameMarkup.push(
						`<use href="#${path.id}" transform="translate(${fmt(x)} ${fmt(baseline)}) scale(${fmt(scale)} ${fmt(-scale)})" fill="${fill}"${opacity ? ` fill-opacity="${opacity}"` : ""}/>`,
					);
				}
				x += glyph.advanceWidth * scale;
			}
		}
	}

	const defs = [...paths.values()]
		.filter(item => item.d)
		.map(item => `<path id="${item.id}" d="${item.d}" fill-rule="nonzero"/>`)
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}" height="${fmt(height)}" viewBox="0 0 ${fmt(width)} ${fmt(height)}"><title>${escapeXml(task.id)}</title><defs>${defs}</defs>${frameMarkup.join("")}</svg>`;
}

function frameBox(frame, taskWidth, taskHeight) {
	const left = Number(frame.left ?? 0);
	const right = Number(frame.right ?? taskWidth);
	const top = Number(frame.top ?? 0);
	const bottom = Number(frame.bottom ?? taskHeight);
	return { left, top, width: right - left, height: bottom - top };
}

function wrapLines(lines, maxWidth, contexts) {
	const wrapped = [];
	for (const line of lines) {
		let current = [];
		let width = 0;
		for (const token of line) {
			const advance = tokenAdvance(token, contexts);
			if (current.length && maxWidth > 0 && width + advance > maxWidth) {
				wrapped.push(current);
				current = [];
				width = 0;
			}
			current.push(token);
			width += advance;
		}
		wrapped.push(current);
	}
	return wrapped.length ? wrapped : [[]];
}

function measureLine(line, contexts) {
	return line.reduce((width, token) => width + tokenAdvance(token, contexts), 0);
}

function tokenAdvance(token, contexts) {
	return queryGlyph(token, contexts).advanceWidth * (fontSizeOf(token.style) / 1000);
}

function queryGlyph(token, contexts) {
	const glyph = contexts[token.contextKey]?.[token.name];
	if (!glyph) throw new Error(`Missing rendered glyph ${token.name}.`);
	return glyph;
}

function maxFontSize(lines) {
	let size = 0;
	for (const line of lines)
		for (const token of line) size = Math.max(size, fontSizeOf(token.style));
	return size || 24;
}

function lineHeightOf(frame, lines) {
	const multiplier = Number(frame["line-height"] ?? 1.2);
	return maxFontSize(lines) * (multiplier > 0 ? multiplier : 1.2);
}

function fontSizeOf(style) {
	const size = Number(style["font-size"] || 24);
	return Number.isFinite(size) && size > 0 ? size : 24;
}

function colorOf(color, theme) {
	const isLight = theme === "light";
	if (!color || ["#20242E", "#DEE4E3"].includes(color.toUpperCase()))
		return [isLight ? "#20242E" : "#DEE4E3", null];
	if (["#20242E40", "#DEE4E340"].includes(color.toUpperCase()))
		return [isLight ? "#20242E" : "#DEE4E3", "0.25"];
	if (["#048FBF", "#03AEE9"].includes(color.toUpperCase()))
		return [isLight ? "#048FBF" : "#03AEE9", null];
	if (["#8757AD", "#B77FDB"].includes(color.toUpperCase()))
		return [isLight ? "#8757AD" : "#B77FDB", null];
	if (["#974CAF", "#C49ED1"].includes(color.toUpperCase()))
		return [isLight ? "#974caf" : "#c49ed1", null];
	return [escapeXml(color), null];
}

function safeId(id) {
	return id.replace(/[^A-Za-z0-9_-]/g, "-");
}

function fmt(n) {
	const rounded = Math.round(n * 1000) / 1000;
	return Object.is(rounded, -0) ? "0" : String(rounded);
}

function escapeXml(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}
