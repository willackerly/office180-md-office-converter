# office180-md-office-converter

> **rebar v3.0.0** | **Tier 3: ENFORCED** | [What is rebar?](https://github.com/willackerly/rebar)

**Deterministic, provenance-aware source ⇄ Microsoft Office workflows.**

| Track | Canonical source | Office artifact | Status |
|---|---|---|---|
| Markdown / Word | `.md` | `.docx` | Implemented and tested |
| PPTV / PowerPoint | `.pptv.svg` / `.pptv.html` | `.pptx` | TypeScript vertical slice, trusted editor foundation, and strict PPTX canary implemented |

## What ships

The implemented product has three command-line surfaces—two Python scripts and
one TypeScript package/CLI—with no server:

- **`md2docx.py`** — converts Markdown to a styled `.docx`, themed by a JSON
  file. Headings, lists, tables, fenced code, inline formatting, blockquotes,
  and an optional marking-style banner all map to real Word styles.
- **`docx2md.py`** — converts that `.docx` back to canonical Markdown by
  inverting the same style choices, so editing the generated document in
  Word (or Google Docs) and converting it back doesn't silently lose or
  invent content.
- **`@office180/pptv`** — a TypeScript source kernel and CLI for non-executing
  `.pptv.html` scan/validation, manifest and semantic projections, stable-ID
  queries, atomic source-preserving text/theme/slide-order patches, exact-source
  editor sessions, deterministic trusted editor wrappers, and strict
  compiler-grade CSS/geometry/text resolution. Its Node boundary also emits a
  deterministic, fail-closed native-shape PPTX canary.

## PowerPoint design track

The same mapping and provenance ideas can support editable presentations. Start
with the **[PPTV Design Index](PPTV-DESIGN-INDEX.md)**, then follow the focused
proposals:

- **[PPTV PowerPoint Vector Profile](PPTV-PROFILE.md)** defines a constrained
  `.pptv.svg` source with stable identities, native-versus-asset intent,
  DOM-order z-order, source maps, and reverse patches.
- **[PPTV HTML Container](PPTV-HTML-CONTAINER.md)** proposes a portable
  manifest-first `.pptv.html` deck with inert slide templates, named themes,
  reusable definitions, and one fixed non-authoritative browser runtime.
- **[PPTV Processing API](PPTV-PROCESSING-API.md)** specifies lazy scanning,
  source-range indexing, semantic projections, stable-ID transactional patches,
  serialization, diagnostics, caching, and agent-efficiency obligations.
- **[PPTV Tooling and Editor Architecture](PPTV-TOOLING-AND-EDITOR.md)** defines
  a TypeScript-first toolchain, native SVG editor, optional
  `.editable.pptv.html`, and selective OpenDocKit reuse.
- **[PPTV Implementation Plan](PPTV-IMPLEMENTATION-PLAN.md)** fixes the initial
  16:9/no-reflow profile direction and sequences the trusted browser editor,
  early PPTX canary, full compiler, OpenDocKit collaboration, and reconciliation
  with explicit acceptance gates.
- **[SVG to Editable PowerPoint playbook](SVG-TO-EDITABLE-PPTX.md)** documents
  the reconstruction, stable-object-ID, round-trip diff, render QA, and native
  PowerPoint validation workflow that motivated the profile.
- **[`examples/minimal-deck.pptv.html`](examples/minimal-deck.pptv.html)** is a
  browser-openable two-slide specimen that also compiles through the current C7
  canary subset.

The C4/C5 source-and-patch kernel now ships with a browser-safe editor session
and read-only trusted wrapper. The in-progress C6 profile also has an executable
fail-closed resolver for fixed 16:9 geometry, hard-line text, groups, opaque SVG
bounds, complete theme tokens, constrained CSS, and provenance. C7 compiles its
strict primitive subset into a fresh deterministic PPTX; the minimal canary
artifact passes ISO/ECMA schema validation, independent OpenDocKit reopen, and
native PowerPoint open/render without repair. Ellipse and translated-group
mappings currently have structural tests rather than native fixture coverage.
Browser parity fixtures, writable bundled controls, broader compilation,
quantitative render comparison, and native PPTX save/reopen remain open gates.

---

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install python-docx
pnpm install
```

`python-docx` is the DOCX runtime dependency. The PPTV package requires
Node.js 20+ and uses `parse5`, `jsonc-parser`, and exactly `jszip@3.10.1`. Run
the Python scripts through the local environment:

```bash
.venv/bin/python md2docx.py notes.md
.venv/bin/python docx2md.py notes.docx
```

(The Python pair has no packaging or entry point yet; see `ROADMAP.md` §0.)

---

## Usage

### PPTV TypeScript tools

```bash
pnpm pptv outline examples/minimal-deck.pptv.html
pnpm pptv validate examples/minimal-deck.pptv.html
pnpm pptv resolve examples/minimal-deck.pptv.html
pnpm pptv editor-pack examples/minimal-deck.pptv.html \
  --output minimal-deck.editable.pptv.html
pnpm pptv pptx-canary examples/minimal-deck.pptv.html \
  --output minimal-deck.pptx
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

Version 0.1 applies direct-text, active-theme, and slide-order transactions to
self-contained `.pptv.html`; the browser-safe session uses those same
transactions for exact undo/redo, while `editor-pack` emits a strict-CSP,
read-only trusted shell around inert canonical bytes and reconstructs its
preview only from literal resolved data. Standalone SVG and external manifests
are recognition-only; CSS token editing, geometry/rich-text editing, writable
bundled controls, PPTX features beyond the strict C7 subset, quantitative
render fidelity, reconciliation, and native PPTX save/reopen remain outside the
verified surface. See
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
  subject (source path): ~/docs/example.md
  category (template):   Plum
  keywords: md2docx
------------------------
```

`docx2md.py` reads this back and prints it to stderr before converting —
it's how the reverse tool knows which theme produced a document's styling,
and (via `srcsha`) whether the original source file has changed since the
DOCX was generated. Full field-by-field spec:
`architecture/CONTRACT-C2-PROVENANCE.1.0.md`.

---

## DOCX round trip

`md2docx` and `docx2md` are designed as a pair, not two independent tools:
the forward converter applies Word styles as a *deterministic function* of
Markdown constructs (`Heading 2` for `##`, a shaded+bordered paragraph for
a code block, a left-bordered indent for a blockquote, a mono-font shaded
run for inline code, and so on), and the reverse converter inverts that
same mapping.

That makes a real workflow possible: generate a `.docx`, hand it to
someone who edits it in Word, run `docx2md.py` on the result, and get back
**canonical Markdown** — one blank line between blocks, `-` bullets,
`**bold**`, no trailing whitespace — rather than a mess of Word's internal
formatting choices. `tests/test_roundtrip.py` proves this for every
construct the tools support: it converts `tests/fixtures/kitchen-sink.md`
forward, then back, and asserts the round trip loses nothing and invents
nothing (a structure-agnostic word-bag comparison — see the test file for
exactly what that means and what's deliberately out of scope, like
relative-link URLs and true byte-for-byte canonical-MD equality).

Honest limits — Google Docs strips non-standard OPC parts on import, links
are demoted rather than preserved as real hyperlinks, and 3-way merge
tooling doesn't exist yet — are documented in `ROADMAP.md` §7.5 and in
`architecture/CONTRACT-C3-ROUNDTRIP.1.0.md`.

**DOCX roadmap:** `ROADMAP.md` is the full hand-off plan — a
CommonMark AST rewrite, wide-table strategies, image support, JSONC
themes with an `extends` chain, and the rest of the symmetry track
(custom-XML source embedding, 3-way merge, a fidelity report).

**PowerPoint roadmap:** `PPTV-DESIGN-INDEX.md` is the entry point for the
broader SVG/HTML source model, processing API, native editor, PowerPoint
adapter, reverse-patch semantics, and conformance path. Contracts C4 and C5,
their schemas, and executable tests define the implemented 0.1 source/read/patch
subset. C6 and C7 are implemented, in-progress resolver/compiler surfaces with
explicit parity, fidelity, and native save/reopen gates. The broader writable
editor, full compiler, and reconciliation surface remains forward design until
promoted the same way.

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
