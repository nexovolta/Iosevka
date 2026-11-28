import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildGlyphs } from "@iosevka/font-glyphs";
import * as Geometry from "@iosevka/geometry";

import { getParametersT } from "../../font/src/param/index.mjs";

await Geometry.Init();
const makePara = await getParametersT({
	paramsDir: fileURLToPath(new URL("../../../params", import.meta.url)),
});

test("mid-height hooks use right-aligned packed bodies and lower n's hook", () => {
	for (const spacing of ["term", "quasi-proportional"]) {
		for (const n of ["straight-serifless", "straight-top-left-serifed"]) {
			const para = makePara({
				shape: {
					serifs: "sans",
					spacing,
					weight: 530,
					width: 586,
					slope: "upright",
					slopeAngle: 0,
				},
				menu: {
					family: "Hook test",
					version: "34.9.0",
					width: 5,
					slope: "upright",
					weight: 400,
				},
				featureControl: { noCvSs: true, noLigation: true },
				variants: { design: { n } },
			});
			const { glyphStore } = buildGlyphs(para);
			for (const prefix of ["d", "n", "s", "t"]) {
				const sourceName = `${prefix}/${prefix === "t" ? "packLeftHook" : "pack75"}`;
				const source = glyphStore.queryByNameEnsured(sourceName);
				const result = glyphStore.queryByNameEnsured(`${prefix}MidHeightLeftHook`);
				const targetWidth = 586 * (prefix === "t" ? 1 : para.advanceScaleM);
				assert.ok(Math.abs(result.advanceWidth - targetWidth) < 1e-6);
				if (spacing === "term") assert.ok(Math.abs(source.advanceWidth - 586 * 0.75) < 1e-6);
				const shift = targetWidth - source.advanceWidth;
				const sourceContours = source.geometry.toBezArcs();
				const resultContours = result.geometry.toBezArcs();
				assert.ok(resultContours.length > sourceContours.length);
				for (let j = 0; j < sourceContours.length; j++) {
					assert.equal(resultContours[j].length, sourceContours[j].length);
					for (let k = 0; k < sourceContours[j].length; k++) {
						const a = source.gizmo.unapply(sourceContours[j][k].eval(0.5));
						const b = result.gizmo.unapply(resultContours[j][k].eval(0.5));
						assert.ok(Math.abs(b.x - a.x - shift) < 1e-6, `${spacing} ${n} ${prefix}`);
						assert.ok(Math.abs(b.y - a.y) < 1e-6, `${spacing} ${n} ${prefix}`);
					}
				}
				if (prefix === "n") {
					const hook = resultContours.slice(sourceContours.length).flat();
					const top = Math.max(
						...hook.flatMap(arc =>
							Array.from({ length: 25 }, (_, i) => result.gizmo.unapply(arc.eval(i / 24)).y),
						),
					);
					assert.ok(top <= para.xHeight * 0.8, `${spacing} ${n}: hook top ${top}`);
				}
			}
		}
	}
});
