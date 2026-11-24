# FINDING — field feedback from a 41-slide executive deck: one fix landed with this note, eight frictions still open

**Status:** FINDING for `office180-md-office-converter` · 2026-11-23 · from a deck-authoring consumer seat
**Baseline checked:** `origin/main` at `97202df` (`@office180/vector180@0.1.0-alpha.5`), macOS 26.6.2
**Labels:** **[M]** measured here · **[V]** verified from source or contract · **[S]** primary standard · **[R]** reported by the author, not re-measured · **[U]** unverified

---

## 0. The one-paragraph version

A consumer project authored a 41-slide executive deck with `vector180 new deck`
and compiled it with `vector180 pptx-canary`. The deck opened and looked right,
but the reviewer's first reaction was "merge text boxes wherever possible. it
makes editing very awkward": because both compilers accepted exactly one hard
line per text object, every line of every paragraph and bullet list had to be
its own text object, and the deck arrived in PowerPoint as roughly 1,600 text
boxes **[R]**. That one is fixed in the change that deposits this note (§1).
Seven more frictions from the same job are recorded in §2–§8, each checked
against the code and each with a suggested remedy; none of them is addressed
here. §9 is a ninth observation made while verifying the fix. Nothing in the
original list turned out to be wrong; three items (§5, §6, §8) needed a more
precise statement, which is given in place.

No deck content, file, or font from the job is reproduced here.

## 1. One hard line per text object → about 1,600 text boxes — FIXED in this change

**Observed.** Every visible line was a separate PowerPoint text box, so
retyping a paragraph meant visiting each line's box **[R]**.

**Verified.** The source profile already accepted several hard lines in one
text object (direct `tspan` children, C6), but both writers refused them:
`Text "…" has N hard lines; C7 accepts exactly one` in
`packages/vector180/src/node/pptx-canary.ts` and the equivalent C9 refusal in
`pptx-baseline.ts` **[V]**. The authoring skill told authors to "represent
visible multiline copy as separate explicit text objects" **[V]**.

**Fix.** C7 2.1 / C9 2.1 / C10 2.1: a text object with N hard lines compiles to
one `p:sp` text box with N `a:p` paragraphs, `wrap="none"`, no autofit, zero
insets, and exact `a:lnSpc/a:spcPts` equal to the declared line step, through
both `pptx-canary` and `compile`. A four-block sample went from 11 text boxes
to 4 with the same 11 paragraphs **[M]**. Lines must share one anchor x and
step by exactly the line step; an empty hard line is a supported blank line;
anything else is refused.

**What the fix does not do.**

- It does not rewrite existing source. A deck that already holds one text
  object per line compiles exactly as before; merging those objects into
  multi-line objects is an author-side source edit (N stable IDs become one).
  **Remedy:** a reviewed `merge-text-lines` authoring helper that proposes the
  merge only for same-style, same-x, exact-step neighbors would turn this into
  one command.
- It does not admit a line with a different `x` (see §8).
- `reconcile` refuses an edited line or moved frame of a multi-line box, and
  `patch set-text` / `set-text-frame` still take one direct hard line. Changing
  such a box means editing its hard lines in source and recompiling.
  **Remedy:** the typed `set-text-lines` operation already listed in `TODO.md`.

## 2. No mixed styles within a line

**Observed.** A bold lead-in followed by regular text on the same line had to
be split into several text objects **[R]**.

**Verified.** A hard line is "one direct, non-nested tspan with only x and y"
(`core/resolved.ts`); a styled or nested `tspan` is a
`VECTOR180-PROFILE-TEXT-LINES` error, and `VECTOR180-PROFILE.md` lists "styled
runs" as deferred **[V]**. One object has exactly one fill, family, size,
weight, and style.

**Remedy.** A contracted run model for the two cases that actually occur in
decks — weight (400/700) and style (normal/italic) changes inside one hard
line — mapped to several `a:r` in one paragraph. Text-fit already measures per
face, so the run widths can be summed against the same capacity. Until then,
a documented recipe for the side-by-side split (measure with `text-fit`, place
the second object at `x + advance`) would remove the guesswork.

## 3. A standalone atom cannot be placed into a deck

**Observed.** Diagrams meant for reuse in a README had to be authored inside
the deck and extracted afterwards, instead of being authored once as atoms and
placed onto slides **[R]**.

**Verified.** `compose` and `compile` take exactly one atom and produce a new
one-slide deck or PPTX; C9 "does not add an atom to an existing deck", and
`QUICKCONTEXT.md` lists "external atom/library dependency resolution,
multi-atom/deck assembly, or C9 deck input" as not implemented **[V]**. The
only bridge runs the other way: `extract --slide` hydrates one deck slide into
an atom **[V]**.

**Remedy.** This is roadmap item 7 ("external composition"). The smallest
useful slice for deck authors is an explicit, hash-bound include: a slide
declares one atom path, its SHA-256, and an identity or uniform placement, and
the deck compiler inlines the already-contracted C9 composition for that
rectangle. No inferred sizing and no live link — a stale hash refuses.

## 4. `compile` is one atom only; the deck path is a "canary" with a fixed title

**Observed.** `compile` takes one atom only. The multi-slide path is
`pptx-canary`, which is labelled a canary / in progress, and the compiled
deck's title property is fixed to "Vector180 deterministic compiler canary"
**[R]**.

**Verified.** `compile` refuses a deck ("accepts a standalone .vector180.svg
atom only; use pptx-canary for the current deck canary") **[V]**. In a deck
compiled here, `docProps/core.xml` holds
`<dc:title>Vector180 deterministic compiler canary</dc:title>` although the
manifest declares its own `title` **[M]**; the string is the default argument
of `renderCoreProperties` and the canary path never overrides it **[V]**.

**Remedy.** (a) Use the deck manifest `title` for `dc:title` — it is already
exact source — or accept an explicit `--title`; either is a small C7 amendment
to the "Compiler identity" row. (b) Say in one place which command a deck
author should use today and what "canary" still withholds, so the label reads
as a scope statement rather than a warning.

## 5. The default font map is ABeeZee only

**Observed.** The default font map covers ABeeZee only, which is not installed
on a stock macOS; an explicit map (Arial plus Menlo) had to be supplied. Menlo
was needed because Arial and Courier New lack ∀ ∃ ∧ ∈ **[R]**.

**Verified.** The omitted/`default` map is one digest-locked ABeeZee Regular
face; any other face needs an explicit map with file paths, and the tool never
discovers a system font **[V]**. On this machine no ABeeZee file exists in the
system or user font folders **[M]**. Glyph coverage, checked with the pinned
`fontkit` against the stock files **[M]**:

| Face (stock macOS file)    | ∀ U+2200 | ∃ U+2203 | ∧ U+2227 | ∈ U+2208 |
| -------------------------- | -------- | -------- | -------- | -------- |
| Arial                      | no       | no       | no       | no       |
| Courier New                | no       | no       | no       | no       |
| Menlo                      | yes      | yes      | yes      | yes      |
| ABeeZee (bundled, default) | no       | no       | no       | no       |

Two consequences follow. A deck scaffolded by `new deck` names a font that a
stock Mac does not have, so PowerPoint or Quick Look substitutes one and the
exact-font evidence no longer describes what is on screen. And the default
face cannot verify common logic symbols at all; `text-fit` correctly reports
them `unverified` rather than substituting **[V]**.

**Remedy.** Keep the no-discovery rule and add a documented "stock fonts"
example map for macOS (Arial, Arial Bold, Menlo, with their standard paths and
`postscriptName` for the `.ttc`) in the skill references, plus a short coverage
note: which stock face to pick for mathematical operators. `text-fit` already
lists `missingCodepoints` per line; what an author lacks is the table above.

## 6. In a deck, a class rule silently wins over a local attribute

**Observed.** A local `fill` or `font-size` attribute on one object had no
effect because the object's class set the same property **[R]**.

**Verified.** On a deck text object whose class declares `fill`, `font-size`,
and `font-weight`, adding `fill="#ff0000" font-size="20" font-weight="700"`
changed nothing: `resolve` reported the class values with
`origin: "base-rule"`, and `validate`/`resolve` emitted no diagnostic. The same
values in an inline `style="…"` did win (`origin: "inline-style"`) **[M]**.
This is the ordinary CSS cascade (a presentation attribute has lower priority
than any author rule **[S]**), so the behavior is correct; what is missing is
any signal. The rule is written down once, in the superseded C6 1.1 contract
("Presentation attributes lose to matching classes; inline declarations
win"). C6 2.0 carries it by reference, and the authoring skill, the agent
guide, and the profile documents do not state it **[V]**.

**Remedy.** Both halves are cheap: one sentence in the deck section of
`authoring-profile.md` ("a class rule overrides a presentation attribute; use
inline `style` for a one-object override"), and a warning diagnostic when a
presentation attribute is shadowed by a class rule for the same property.

## 7. Quick Look shows only slide 1

**Observed.** Quick Look renders only slide 1 of a multi-slide PPTX, which
lengthens the visual check loop **[R]**.

**Verified.** `qlmanage -t` on a two-slide deck compiled here produced exactly
one PNG, of slide 1 **[M]**; the evidence README already calls Quick Look "a
first-slide automated preview" **[V]**. There is no `render` command, and the
agent guide tells agents not to invent one **[V]**.

**Remedy.** A built-in per-slide preview. The parts exist: `extract` hydrates
any slide into an atom and `scripts/capture-browser-svg.mjs` captures a
standalone atom in Chromium. A `vector180 render deck.vector180.html --slide ID
--output slide.png` (or `--all` into a directory) would close the loop without
claiming PowerPoint fidelity; it should label the renderer the way C11 does.

## 8. Indentation in code blocks must be carried by x position

**Observed.** Indentation in code blocks had to be carried by each line's `x`
position, not by leading spaces **[R]**.

**Verified, with one precision.** The profile gives the source no way to ask
for preserved whitespace: `xml:space` is not an accepted text attribute and
`white-space` is in the unsupported-property list **[V]**, so an SVG renderer
collapses leading spaces **[S]**. The PPTX writer, however, keeps them (`a:t` gets
`xml:space="preserve"`) **[V]**. Leading spaces therefore produce a browser
view and a PowerPoint slide that disagree, with no diagnostic. Carrying
indentation by `x` is the only form on which both agree.

**Interaction with §1.** The multi-line text box requires one shared anchor x,
so an indented line still cannot join its neighbors: a code block with three
indentation levels remains at least one text object per indentation run.

**Remedy.** (a) A warning when a hard line begins or ends with whitespace.
(b) Admit a per-line start-anchored `x` inside one text box as a per-paragraph
left margin, with matched C7/C9/C10 rules; this is now a `TODO.md` item.

## 9. Found while verifying §1: Quick Look advances fractional-point line steps as whole points

**Measured.** The same copy was compiled twice, as one multi-line object per
block and as stacked one-line objects whose frames step down by one line step,
then rendered with `qlmanage -t -s 1600` and compared by ink-row position
**[M]**:

| Line step             | One box vs stacked boxes in Quick Look                  |
| --------------------- | ------------------------------------------------------- |
| 45 units (27 pt)      | pixel-identical (0 changed pixels, 10 of 10 line bands) |
| 50, 40, 60, 100 units | identical line positions on all 8 probe lines           |
| 48 units (28.8 pt)    | line pitch ≈ 46.7 px, not 48; line 8 sits 9 px too high |
| 36 units (21.6 pt)    | line pitch ≈ 35.1 px, not 36; line 8 sits 7 px too high |

Horizontal positions matched in every case. One unit is 0.6 pt, so a step that
is a multiple of 5 units is a whole number of points. For any other step Quick
Look advances the second and later paragraphs by the whole-point part only
(28.8 pt as 28 pt). The PPTX stores the exact value (`spcPts val="2880"`).
Whether native PowerPoint does the same was **not** measured **[U]**; no native
PowerPoint render was run for this note.

**Remedy.** The skill reference now recommends a multiple-of-5 line step for
multi-line objects. The durable answer is the native PowerPoint evidence that
`TODO.md` already asks for; if PowerPoint honors the fraction, this stays a
Quick Look caveat, and if it does not, C7 should refuse or warn on
fractional-point steps for multi-line objects.

## 10. Reproduction notes

- §1 and §9: `packages/vector180/test-fixtures/c7/multiline-text.vector180.html`
  and `…/c9/multiline-text.vector180.svg` are the checked fixtures; the
  one-box/stacked comparison is repeated structurally in
  `src/__tests__/pptx-multiline-text.test.ts`. The Quick Look numbers came from
  an 8-line probe per step with font family Arial.
- §5: `fontkit` `hasGlyphForCodePoint` on
  `/System/Library/Fonts/Supplemental/Arial.ttf`, `…/Courier New.ttf`,
  `/System/Library/Fonts/Menlo.ttc` (first face), and the bundled ABeeZee.
- §6: add the three attributes, then the equivalent inline `style`, to a deck
  title whose class sets the same properties; compare `resolve --format json`.
- §7: `qlmanage -t -s 1600 -o OUT deck.pptx` on any deck with two slides.
