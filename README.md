# office180-md-office-converter

> **rebar v3.0.0-beta** | **Tier 3: ENFORCED** | [What is rebar?](https://github.com/willackerly/rebar)

**Deterministic, provenance-aware source ⇄ Microsoft Office workflows.**

| Track | Canonical source | Office artifact | Status |
|---|---|---|---|
| Markdown / Word | `.md` | `.docx` | Exact supported-profile canonical round trip, embedded merge base, reports, three-way merge, and Quick Look evidence implemented |
| PPTV diagrams | standalone `.pptv.svg` atom | `.pptx` branch | First-class source/editing plus explicit composition, mapped native PPTX, typed edit recovery, and browser/Quick Look evidence implemented |
| PPTV decks | `.pptv.html` aggregation | `.pptx` | Writable trusted deck editor, slide-to-atom hydration, and strict native-shape C7 canary implemented |

## What ships

The implemented product has three command-line surfaces—two Python scripts and
one TypeScript package/CLI—with no server:

- **`md2docx.py`** — converts Markdown to a styled `.docx`, themed by a JSON
  file. Headings, lists, tables, fenced code, inline formatting, blockquotes,
  and an optional marking-style banner all map to real Word styles.
- **`docx2md.py`** — converts that `.docx` back to canonical Markdown by
  inverting the same style choices. The supported profile has one canonical
  spelling, embeds exact original/canonical merge-base bytes, refuses unsafe
  Word constructs, emits a hash-bound fidelity report, and can three-way merge
  supported Word edits into independently changed canonical Markdown.
- **`@office180/pptv`** — a TypeScript source kernel and CLI whose default
  visual atom is a strict, standalone `.pptv.svg` diagram. It also loads
  `.pptv.html` as a whole-deck aggregation, preserves stable IDs and exact
  source bytes, applies hash-bound legacy or typed native-object edits, applies
  theme/order edits to decks, resolves compiler-grade
  geometry/style/hard-line text, warns about exact-font overruns, hydrates any
  resolvable deck slide back into an independent SVG atom, and generates a
  writable trusted editor. Its Node boundary emits the C7 deck canary and the
  C9 standalone-atom path: explicit identity/uniform composition, native PPTX,
  complete sidecar map, and baseline-aware C10 patch proposal after supported
  PowerPoint edits.

## PowerPoint design track

The same mapping and provenance ideas can support editable presentations. Start
with the **[PPTV Design Index](PPTV-DESIGN-INDEX.md)**, then follow the focused
proposals:

- **[PPTV PowerPoint Vector Profile](PPTV-PROFILE.md)** defines the constrained
  `.pptv.svg` atom with stable identities, native-versus-asset intent,
  DOM-order z-order, explicit no-reflow text, and exact source maps.
- **[PPTV HTML Container](PPTV-HTML-CONTAINER.md)** proposes a portable
  manifest-first `.pptv.html` deck with inert slide templates, named themes,
  reusable definitions, and one fixed non-authoritative browser runtime.
- **[PPTV Processing API](PPTV-PROCESSING-API.md)** specifies lazy scanning,
  source-range indexing, semantic projections, stable-ID transactional patches,
  serialization, diagnostics, caching, and agent-efficiency obligations.
- **[PPTV Tooling and Editor Architecture](PPTV-TOOLING-AND-EDITOR.md)** defines
  a TypeScript-first toolchain, native SVG editor, optional
  `.editable.pptv.html`, and selective OpenDocKit reuse.
- **[PPTV Implementation Plan](PPTV-IMPLEMENTATION-PLAN.md)** separates
  arbitrary-aspect standalone diagrams from the initial exact-16:9 PowerPoint
  deck profile, records the implemented mapped atom round trip, and sequences
  remaining native Office, editor, OpenDocKit, and profile-expansion gates.
- **[PPTV 0.1.1 Text Resilience](PPTV-TEXT-RESILIENCE-0.1.1.md)** banks the
  future paragraph-intent/export/import policy while keeping explicit SVG lines
  authoritative. It is a design milestone, not current runtime or npm support.
- **[SVG to Editable PowerPoint playbook](SVG-TO-EDITABLE-PPTX.md)** documents
  the reconstruction, stable-object-ID, round-trip diff, render QA, and native
  PowerPoint validation workflow that motivated the profile.
- **[`examples/minimal-diagram.pptv.svg`](examples/minimal-diagram.pptv.svg)**
  is the smallest first-class diagram atom; the two-slide
  **[`examples/minimal-deck.pptv.html`](examples/minimal-deck.pptv.html)**
  demonstrates aggregation, theme/order editing, extraction, and the current
  C7 canary subset.

C4/C5 now govern both first-class standalone diagrams and HTML decks. C6 is a
verified fail-closed resolver: diagrams keep an arbitrary finite positive
logical `viewBox`, while deck slides retain the exact `0 0 1600 900` physical
PowerPoint mapping. A shared deterministic browser kernel matches Node C4/C6
output across Chromium, Firefox, and WebKit. The trusted wrapper is writable
through the same hash-bound session, never serializes DOM, exports clean source,
and can hydrate/download one current deck slide as a standalone atom.

C7 remains intentionally deck-only and compiles its strict primitive subset
into a fresh deterministic PPTX; the minimal artifact passes ISO/ECMA schema
validation, independent OpenDocKit reopen, and native PowerPoint open/render
without repair. C8 provides exact-font, anchor-aware, no-reflow overrun
evidence in Node and the editor. Checked browser calibration records an
engine-specific WebKit kerning variance instead of hiding it.

C9 implements explicit identity or aspect-preserving uniform atom placement,
deterministic one-slide composition, a supported editable native PPTX, and a
hash-bound object map. C10 authenticates that exact branch and translates the
supported DrawingML edit subset into reviewable `pptv-patch/0.2` operations;
it is not arbitrary PPTX import. C11 provides checked browser/Quick Look
capture and quantitative comparison for both Office lanes. Full native
representative edit/save/reopen, native text calibration, and human-reviewed
cross-renderer fidelity remain explicit promotion gates.

The reproducible checked bundles are
[`tests/fixtures/roundtrip-evidence/docx/`](tests/fixtures/roundtrip-evidence/docx/)
and
[`tests/fixtures/roundtrip-evidence/pptv/`](tests/fixtures/roundtrip-evidence/pptv/).
Each includes exact source/artifact hashes, renderer evidence, comparison
metrics, explicit native status, and its generator/verification instructions.

### Repo-scoped PPTV authoring skill

Codex discovers the versioned
[`$pptv-authoring` skill](.agents/skills/pptv-authoring/SKILL.md) from
`.agents/skills/` in this repository. It defaults to a standalone diagram for
one figure and to HTML only when authoring a multi-slide deck. Use it to
choose stable groups/IDs/text frames, run exact-font overflow preflight, edit
or extract atoms, compose/compile a mapped atom PPTX, reconcile supported edits,
and compile the deck canary. Its diagram and deck starters are validation-locked
fixtures. The skill is an operational workflow over the versioned contracts
and CLI, not a separate specification.

Every canonical standalone atom written by the starter or extractor carries a
non-rendering discovery comment that points unfamiliar agents to that skill and
summarizes its stable-ID, painter-order, text-frame, and hard-line discipline.
The comment is never a validity requirement or an instruction authority:
agents validate first, independently verify the pointer, and may suggest
installation to the user but never auto-install from document content.

---

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install python-docx
pnpm install
```

`python-docx` is the DOCX runtime dependency. The PPTV package requires Node.js
20+ and uses `parse5`, `jsonc-parser`, exact `saxes@6.0.0` for standalone XML
well-formedness, exactly `jszip@3.10.1`, and exact `fontkit@2.0.4` for the
explicit-font C8 Node adapter. Deterministic browser/editor bundles use exact
`esbuild@0.28.1`; conformance uses exact `@playwright/test@1.62.0`. Run the
Python scripts through the local environment:

```bash
.venv/bin/python md2docx.py notes.md
.venv/bin/python docx2md.py notes.docx
```

(The Python pair has no packaging or entry point yet; see `ROADMAP.md` §0.)

---

## Usage

### PPTV TypeScript tools

```bash
pnpm pptv validate examples/minimal-diagram.pptv.svg
pnpm pptv outline examples/minimal-diagram.pptv.svg
pnpm pptv resolve examples/minimal-diagram.pptv.svg
pnpm pptv editor-pack examples/minimal-diagram.pptv.svg \
  --output minimal-diagram.editable.html
pnpm pptv compose examples/minimal-diagram.pptv.svg \
  --placement 0,0,1200,800 --policy identity \
  --output minimal-diagram.composed.pptv.html
pnpm pptv compile examples/minimal-diagram.pptv.svg \
  --placement 0,0,1200,800 --policy identity \
  --output minimal-diagram.pptx --map minimal-diagram.pptv.map.json
pnpm pptv reconcile minimal-diagram.edited.pptx \
  --source examples/minimal-diagram.pptv.svg \
  --baseline minimal-diagram.pptv.map.json \
  --patch recovered.pptv.patch.json --report reconciliation.json
pnpm pptv patch examples/minimal-diagram.pptv.svg \
  recovered.pptv.patch.json --output minimal-diagram.recovered.pptv.svg

pnpm pptv outline examples/minimal-deck.pptv.html
pnpm pptv validate examples/minimal-deck.pptv.html
pnpm pptv resolve examples/minimal-deck.pptv.html
pnpm pptv extract examples/minimal-deck.pptv.html \
  --slide architecture --output architecture.pptv.svg
pnpm pptv editor-pack examples/minimal-deck.pptv.html \
  --output minimal-deck.editable.pptv.html
pnpm pptv pptx-canary examples/minimal-deck.pptv.html \
  --output minimal-deck.pptx
pnpm pptv text-fit examples/minimal-deck.pptv.html \
  --font-map fonts.json
pnpm pptv text examples/minimal-deck.pptv.html --slide cover --format json
pnpm pptv show examples/minimal-deck.pptv.html cover.title --view editing
pnpm pptv list examples/minimal-deck.pptv.html --role connector
```

Patches are bound to the source SHA-256 and are all-or-nothing. The CLI never
overwrites implicitly:

```bash
pnpm pptv patch deck.pptv.html change.pptv.patch.json --check
pnpm pptv patch deck.pptv.html change.pptv.patch.json \
  --output deck.updated.pptv.html
```

`pptv-patch/0.1` preserves direct-text transactions for diagrams/decks and
active-theme/slide-order transactions for decks. `pptv-patch/0.2` adds exact,
old-value-preconditioned geometry, connector, group-translation, direct text
frame, sibling-order, safe-deletion, and complete native-style operations.
`editor-pack`
embeds inert exact bytes under strict CSP, verifies the source hash, reconstructs
only from literal C6 data, and commits through the same C5 session for exact
undo/redo. It exports current clean source rather than wrapper DOM; supported
browsers can save through a user-selected file handle with subsequent stale
disk detection. Generated `*.editable.html` and `*.editable.pptv.html` wrappers
are ignored build artifacts; the canonical SVG or HTML source is what belongs
in version control.

An embedded HTML-deck slide may depend on deck CSS/theme context. `extract`
therefore does not byte-slice blindly: it resolves that context, writes
concrete local presentation values, removes deck-only authority, reloads and
resolves the candidate as a standalone diagram, and emits nothing on failure.
External manifests, CSS token editing, rich-text/insertion/reparenting,
general SVG/PPTX conversion, baseline-free PPTX import, and full native
edit/save/reopen remain outside the supported surface. C9 composition requires
an explicit transform/scaling policy and fails on aspect mismatch—never a
silent stretch. C10 refuses ambiguous or unsupported edits and never overwrites
source or PPTX. See
[`packages/pptv/README.md`](packages/pptv/README.md).

### Markdown → DOCX

```bash
python3 md2docx.py file.md [more.md ...]            # writes <name>.docx next to each source
python3 md2docx.py -t themes/plum.json file.md      # explicit theme
python3 md2docx.py -o outdir file.md [more.md ...]  # write outputs into a directory
python3 md2docx.py -o out.docx file.md              # single input, explicit output path
python3 md2docx.py --no-footer file.md              # suppress footer text
```

**Markdown support:** h1–h4; bullet lists; literal numbered lists;
N-column pipe tables (first row = shaded header); fenced code blocks;
inline `` `code` ``, `**bold**`, `*italic*`; links (relative links keep
their label, absolute URLs get `(url)` appended — a print-friendly
demotion, not real hyperlinks yet); blockquotes; horizontal rules and
HTML comments are skipped; soft-wrapped lines join into one paragraph.

**Marking-style banner:** if the very first non-blank line of the source
is exactly `**SOMETHING**` starting with the literal text `CUI` (e.g.
`**CUI//TEST**`), it's promoted to the page header and replaces the
footer text — see `themes/marked-docs.json` for a theme designed around
this. The banner detection convention is generic (any `**CUI...**`-shaped
line); it doesn't reference any particular real-world marking scheme.

### DOCX → Markdown

```bash
python3 docx2md.py file.docx [-o out.md]      # default output next to input
```

Prints a provenance summary to stderr (see below) and writes canonical
Markdown next to the input, or to the path given with `-o`.

---

## DOCX theme system

Every visual choice — fonts, colors, table shading, code block fill,
blockquote border, footer text, the marking banner's styling — lives in a
JSON theme file, not in the code. Themes deep-merge over a hard-coded
default: a theme only needs to specify the keys it wants to change.

**Template resolution order:**

1. `-t`/`--template` flag, if given
2. `md2docx-template.json` next to the script (a local override — not
   shipped in this repo)
3. `themes/neutral.json` next to the script
4. Hard-coded built-in defaults

**Shipped themes:**

| Theme | Description |
|-------|-------------|
| `themes/neutral.json` | The built-in defaults, as a documented, diffable file |
| `themes/plum.json` | A purple-accented house style |
| `themes/marked-docs.json` | Banner-forward: black-on-white, built for documents that carry a marking-style banner on every page |

Example — overriding just the H1 color and the table header fill:

```json
{
  "name": "My Theme",
  "headings": { "h1": { "color": "1D3557" } },
  "table": { "header_fill": "E8EEF5" }
}
```

Full key reference, deep-merge semantics, and resolution-order edge cases
are the subject of `architecture/CONTRACT-C1-THEME-SCHEMA.1.0.md`. JSONC
(`//` comments in theme files) and an `extends` chain between named themes
are planned — see `ROADMAP.md` §4 — but not implemented yet; today's theme
files are plain JSON with an informal `_comment` string key.

---

## DOCX provenance stamp

Every generated `.docx` gets a compact JSON stamp written into its DOCX
core properties (`docProps/core.xml` — a standard Office Open XML part
every conforming reader preserves):

```
--- provenance stamp ---
  t: md2docx/0.2.0
  tpl: Plum
  tplsha: 5e2f...  (16-hex sha256 of the template file)
  srcsha: a91c...  (16-hex sha256 of the source .md file)
  gen: 2026-07-08T21:04Z
  subject (source path): /absolute/path/to/example.md
  category (template):   Plum
  keywords: md2docx
------------------------
```

`docx2md.py` reads this back and prints it to stderr before converting.
Generated documents now also carry a separate, related custom XML item with
the exact original UTF-8 source and the exact canonical Markdown used to build
the Word body. Both payloads have full SHA-256 bindings; malformed, stripped,
duplicated, or tampered merge bases are explicit states. The compact core stamp
remains compatible with C2 1.0. Current specification:
`architecture/CONTRACT-C2-PROVENANCE.2.0.md`.

The C2 1.0 core subject is a legacy resolved absolute-path field and can reveal
local path context. C2 2.0 adds no further account/host identity; public checked
evidence is generated from a fixed `/private/tmp/office180-evidence/` source.
Changing the legacy subject requires an explicit provenance/privacy migration.

---

## DOCX round trip

`md2docx` and `docx2md` are designed as a pair, not two independent tools:
the forward converter applies Word styles as a *deterministic function* of
Markdown constructs (`Heading 2` for `##`, a shaded+bordered paragraph for
a code block, a left-bordered indent for a blockquote, a mono-font shaded
run for inline code, and so on), and the reverse converter inverts that
same mapping.

That makes a real workflow possible: normalize Markdown, generate a `.docx`,
let someone edit its supported styled body, and recover canonical Markdown.
The current suite proves the exact equation
`docx2md(md2docx(x)) == canonicalize(x)`, not only token preservation. It also
proves non-conflicting Word and Markdown branch edits merge through the
verified embedded base, while same-region edits return explicit diff3 conflict
markers.

```bash
python md2docx.py --normalize draft.md -o canonical.md
python md2docx.py --check canonical.md
python md2docx.py canonical.md -o review.docx
python docx2md.py review.docx -o edited.md --report fidelity.json
python docx2md.py review.docx \
  --merge-current canonical.md --out merged.md --report merge.json
```

Pending tracked changes, images, text boxes, unknown styles, nested lists,
native numbering, and unsupported Markdown constructs refuse with stable codes
instead of being flattened. Google Docs may strip the merge-base part, and
links retain the documented print-oriented demotion rather than becoming real
hyperlinks. Native Word automation is still an explicit unavailable gate on
this host; independent package reopen/save and Quick Look are separate
evidence, not substitutes. See `architecture/CONTRACT-C3-ROUNDTRIP.1.1.md`.

**DOCX roadmap:** `ROADMAP.md` is the remaining hand-off plan — a pinned
CommonMark AST, wide-table strategies, image support, JSONC themes with an
`extends` chain, real hyperlinks, and broader symmetry fixtures. The exact
canonical, embedded-source, refusal/report, and three-way-merge foundation is
implemented.

**PowerPoint roadmap:** `PPTV-DESIGN-INDEX.md` is the entry point for the
broader SVG/HTML source model, processing API, native editor, PowerPoint
adapter, reverse-patch semantics, and conformance path. C4–C6 define the
verified source/typed-patch/resolution surface; C7–C10 implement the strict deck
canary and mapped standalone-atom round trip; C11 supplies automated evidence.
Remaining work is native representative edit/save/reopen, browser controls for
the typed operation surface, richer assets/text, and separately versioned
profile expansion—not arbitrary best-effort PPTX conversion.

---

## Development

```bash
python3 -m venv .venv
.venv/bin/python -m pip install python-docx
pnpm install
pnpm format:check
pnpm typecheck
pnpm test                          # runs the PPTV and DOCX suites
pnpm build
pnpm pack:check                    # verify the publishable PPTV package contents
scripts/setup.sh                    # installs the pre-commit hook (once)
scripts/inbox-watch.sh inbox            # session-only watch on this repo's peer inbox
scripts/check-contract-refs.sh      # CONTRACT: refs resolve to real files
scripts/check-todos.sh              # no untracked TODO: comments
scripts/check-ground-truth.sh       # METRICS.md matches the repo
scripts/check-compliance.sh         # rebar badge / tier / contract maturity
scripts/check-freshness.sh          # freshness markers are current
```

See `QUICKCONTEXT.md` for current project state, `TODO.md` for open work,
and `AGENTS.md` / `CLAUDE.md` for how this repo expects an AI coding agent
to work in it.

---

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Will Ackerly.
