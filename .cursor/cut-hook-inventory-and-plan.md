# Cut-hook inventory and implementation plan

Status: planning only; no new hook geometry or selectors have been implemented.

## Names and design

- `vertical-cut-hook`: Futura-like C terminal with a vertical cut.
- `diagonal-cut-hook`: DIN-like C terminal with a diagonal cut.

These are proposed descriptive variant names, not claims that either design
must copy a particular font. Establish the exact cut angle, terminal position,
and stroke behavior from references and proofs before implementing. A cut is
part of the curved terminal, not a corner-hook stub added to a flat terminal.

## Inventory

The tables identify source families whose flat/corner-hook paths or related
helpers are used. A family name denotes its applicable configured variants,
not every glyph or every style defined in the module. Derived, transformed,
accented, packed, and selected forms require dependency tracing; being listed
does not imply that a new public selector already exists.

### Direct flat/corner arc consumers

| Source                                                                        | Glyph families and uses to audit                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [2](../packages/font-glyphs/src/number/2.ptl)                                 | Lining and oldstyle 2, turned 2, Rum/rum rotunda, r-rotunda loop and their um forms.                                                                                                                                                                                           |
| [3](../packages/font-glyphs/src/number/3.ptl)                                 | Lining and oldstyle 3; top and bottom hook configurations.                                                                                                                                                                                                                     |
| [5](../packages/font-glyphs/src/number/5.ptl)                                 | Lining and oldstyle 5, Zhuang tone five; `Flat` and corner helper construction.                                                                                                                                                                                                |
| [6](../packages/font-glyphs/src/number/6.ptl)                                 | 6 flat/corner-hook body; 9, reversed 6, partial derivative, eth, and insular d inherit six-family shapes. The toothed terminal is a separate style.                                                                                                                            |
| [C](../packages/font-glyphs/src/letter/latin/c.ptl)                           | C/c and small caps, reversed C/c, open O/o, hooked, curly-tailed, stretched, slashed, looped-cedilla and right-loop forms; Cyrillic E/e, Ukrainian Ye/ye, wide es and Koppa; late Roman six, euro and cent kernels. Accented and transformed descendants also follow the base. |
| [a](../packages/font-glyphs/src/letter/latin/lower-a.ptl)                     | Double-storey a, reversed a, swash, half and retroflex forms using the configured top hook.                                                                                                                                                                                    |
| [e](../packages/font-glyphs/src/letter/latin/lower-e.ptl)                     | e, reversed e, barred, notched, flourish and retroflex e; schwa and hooked schwa; Abkhaz Che/che forms.                                                                                                                                                                        |
| [g](../packages/font-glyphs/src/letter/latin/lower-g.ptl)                     | Applicable double- and single-storey g hooks, insular phonotypic g, cap, stroke, palatal and crossed-tail forms.                                                                                                                                                               |
| [t](../packages/font-glyphs/src/letter/latin/lower-t.ptl)                     | t and phonotypic, packed, hooked, tailed, cedilla and ligature components; `tsLig` has a separate flat/corner arc and t also uses a corner helper.                                                                                                                             |
| [S](../packages/font-glyphs/src/letter/latin/s.ptl)                           | S/s, small cap, reversed and swash forms, curly tail, Cyrillic Dzwe/dzwe and dollar kernels; independently configured top and bottom.                                                                                                                                          |
| [G](../packages/font-glyphs/src/letter/latin/upper-g.ptl)                     | G, small cap, hooked and stroked G, phonotypic insular G, Komi Sje/sje.                                                                                                                                                                                                        |
| [P](../packages/font-glyphs/src/letter/latin/upper-p.ptl)                     | P, Greek Rho, small cap, hooked, stroked, flourish and squirrel-tail P, ruble and peso shapes; exported P shapes have additional consumers.                                                                                                                                    |
| [ezh](../packages/font-glyphs/src/letter/latin-ext/ezh.ptl)                   | Ezh/ezh, reversed ezh, ounce and applicable tailed and hooked forms.                                                                                                                                                                                                           |
| [glottal stop](../packages/font-glyphs/src/letter/latin-ext/glottal-stop.ptl) | Forward/reversed, capital, small and modifier glottal stops, and dependent turned and barred forms.                                                                                                                                                                            |
| [question](../packages/font-glyphs/src/symbol/punctuation/emotion.ptl)       | Question, inverted and reversed question, interrobang and inverted interrobang use the glottal-stop module's shared question shapes; combine each cut with smooth and corner bodies and punctuation-dot variants. |
| [insular t](../packages/font-glyphs/src/letter/latin-ext/insular-t.ptl)       | Insular T/t and phonotypic forms; top follows C configuration, bottom has its own arc.                                                                                                                                                                                         |
| [sigmoid S](../packages/font-glyphs/src/letter/latin-ext/sigmoid-s.ptl)       | Sigmoid S/s and insular-g consumers of its exported shape.                                                                                                                                                                                                                     |
| [yogh](../packages/font-glyphs/src/letter/latin-ext/yogh.ptl)                 | Yogh/yogh and Et/et.                                                                                                                                                                                                                                                           |
| [Cyrillic ze](../packages/font-glyphs/src/letter/cyrillic/ze.ptl)             | Ze/ze, Dhe/dhe, reversed Ze/ze and bar, Latin epsilon/reversed epsilon and rhotic forms, Tresillo/tresillo and Komi Dzje/Zje families; review exported `CyrZe` consumers separately.                                                                                           |
| [final sigma](../packages/font-glyphs/src/letter/greek/lower-final-sigma.ptl) | Final sigma's top-hook/tail combinations; stigma has separate `Flat` tail geometry and aliases top-hook variants rather than drawing those hooks.                                                                                                                              |
| [letter symbols](../packages/font-glyphs/src/symbol/letter.ptl)               | Sterling and lira hook shapes directly; euro-currency and spesmilo use the C/S configurations. Audit other exported-shape consumers individually.                                                                                                                              |
| [ampersand](../packages/font-glyphs/src/symbol/punctuation/ampersand.ptl)     | Upper-open/closed and et-style flat/corner-hook ampersands.                                                                                                                                                                                                                    |
| [at](../packages/font-glyphs/src/symbol/punctuation/at.ptl)                   | Applicable `at` flat/corner-hook configurations.                                                                                                                                                                                                                               |
| [pilcrow](../packages/font-glyphs/src/symbol/punctuation/pilcrow.ptl)         | Flat/corner-hook pilcrow and mirrored reversed pilcrow.                                                                                                                                                                                                                        |
| [section](../packages/font-glyphs/src/symbol/punctuation/section.ptl)         | Section sign with independent configured top/bottom styles.                                                                                                                                                                                                                    |

### Related corner-helper consumers

These seven modules import corner measurements or terminal helpers but do not
necessarily use the full flat/corner arc primitive. Audit applicability rather
than automatically adding cut-hook selectors to them.

| Source                                                            | Families to investigate                                                                                    |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [f](../packages/font-glyphs/src/letter/latin/lower-f.ptl)         | f, palatal f and feng-trill designs; top and descending-tail hooks are separately constrained.             |
| [j](../packages/font-glyphs/src/letter/latin/lower-j.ptl)         | Dotless j, barred and hooked variants and dependent j.                                                     |
| [r](../packages/font-glyphs/src/letter/latin/lower-r.ptl)         | r, turned/long-leg/hooked forms and insular f; uses corner outset.                                         |
| [y](../packages/font-glyphs/src/letter/latin/lower-y.ptl)         | Applicable cursive y and related tails; distinguish the separate non-cursive constructions.                |
| [J](../packages/font-glyphs/src/letter/latin/upper-j.ptl)         | J, small-cap J, curly-tail J and Latin iota forms.                                                         |
| [eszett](../packages/font-glyphs/src/letter/latin-ext/eszet.ptl)  | Eszett and Middle Scots S constructions using the corner start.                                            |
| [long s](../packages/font-glyphs/src/letter/latin-ext/long-s.ptl) | Long s top hooks and selected baseline/descending tail constructions; preserve existing tail restrictions. |

Other `Letter-Arc-Hook` imports of `ArcStartSerifWidth` or
`MakeMidHeightLeftHook` alone are not flat/corner-hook consumers.
An exported shape import is not proof that every glyph in the importing module
uses the affected terminal: trace the configured branch before modifying it.
Examples worth tracing include [9](../packages/font-glyphs/src/number/9.ptl),
[eth and partial](../packages/font-glyphs/src/letter/latin-ext/lower-eth.ptl),
[upper R](../packages/font-glyphs/src/letter/latin/upper-r.ptl),
[thorn](../packages/font-glyphs/src/letter/latin-ext/upper-thorn.ptl),
[Cyrillic de](../packages/font-glyphs/src/letter/cyrillic/de.ptl), and
[Cyrillic dzzhe](../packages/font-glyphs/src/letter/cyrillic/dzzhe-zhwe.ptl).

Greek lowercase iota in [lower-il](../packages/font-glyphs/src/letter/latin/lower-il.ptl)
is a top-hook-only cut-hook consumer: add the new variants to the top terminal
only. Do not extend them to any bottom hook or tail forms.

### Requested question, glottal-stop, r and t coverage

- Add both cut hooks to the shared question/glottal shapes, including smooth
  and corner bodies and their forward/reversed orientations. Propagate them
  through question marks, interrobangs, glottal-stop sizes and turned, barred,
  modifier and other dependent forms.
- Add both cuts to applicable [r](../packages/font-glyphs/src/letter/latin/lower-r.ptl)
  shoulder terminals, including the corresponding turned and derived forms.
  Its custom hook geometry uses corner-helper measurements rather than the
  complete arc primitive, so adapt it without changing unrelated stems.
- Add both cuts to applicable [t](../packages/font-glyphs/src/letter/latin/lower-t.ptl)
  bottom hook terminals and separately evaluate its `tsLig` arc. Preserve
  crossbars, tail-specific behavior, anchors and all dependent t forms.
- Include these families in selector integration and thin/regular/heavy
  upright/italic QA, not merely in the dependency inventory.

## Implementation sequence

1. Make side-by-side reference proofs of the intended C/c cuts; settle cut
   orientation in upright and italic frames and how it scales with weight.
   Unicode charts establish character identity, not a mandatory stylistic cut.
2. Implement shared primitives in [arc-hook](../packages/font-glyphs/src/letter/shared/arc-hook.ptl)
   for both cuts, covering left/right and start/end orientations. Preserve
   smooth transitions, adequate counterspace, and consistent stroke weight;
   do not mutate the existing flat, corner, rounded or toothed geometry.
3. Wire C/c and reversed/turned C shapes first, extending the configuration
   and independent top/bottom combinations where supported. Verify all C-based
   descendants and existing asymmetric selectors before expanding to the
   remaining direct consumers. Preserve explicit existing tail restrictions.
4. Walk the inventory and the exported-shape dependency graph, adding each
   cut to applicable consumers and their existing variant combinations.
   Treat custom Flat-only geometry and helper-only consumers as separate
   design decisions; do not silently change unrelated tails. For Greek lower
   iota, add cuts only at the top hook. Maintain component attachment, metrics,
   anchors and composed-glyph behavior.
5. Add named selectors, OpenType mappings, sampler/preview text and descriptions
   in [variants.toml](../params/variants.toml) and the existing variant
   documentation generation workflow. Keep current defaults and old selector
   names unchanged; ensure selector-following derivatives resolve correctly.
6. Add focused regression cases for each primitive orientation and for
   representative top/bottom combinations, inherited shapes, transforms,
   terminal clipping and existing-selector compatibility. Check finite
   contours, connectivity, counter openings and absence of self-intersections.
7. Generate and visually inspect all newly exposed selectors and affected
   derivatives together at thin, regular and heavy weights in upright and
   italic. Compare related glyphs side by side and inspect joins, bevels,
   spikes, kinks, bumps, dents, hairlines, clipping, overlaps, self-intersections,
   spacing, and accents. Include narrow/proportional stress cases and iterate
   on failures before considering the work complete.
