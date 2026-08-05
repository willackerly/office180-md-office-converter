# office180-md-office-converter

> **rebar v3.0.0-beta** | **Tier 3: ENFORCED** | [What is rebar?](https://github.com/willackerly/rebar)

**Deterministic, provenance-aware source ⇄ Microsoft Office workflows.**

| Track                   | Canonical source                       | Office artifact         | Status                                                                                                                                      |
| ----------------------- | -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown / Word         | `.md`                                  | `.docx`                 | Exact supported-profile round trip, merge base, native-save normalization proof, three-way merge, and visual/lifecycle evidence implemented |
| Vector180 visual atoms  | standalone `.vector180.svg`            | optional `.pptx` branch | `0.1.0-alpha.5` implemented, locally test-accepted release candidate; not npm-published                                                     |
| Vector180 decks/reports | explicit `.vector180.html` aggregation | `.pptx`                 | Reader/editor deck slice implemented locally; C7 compiler acceptance remains in progress                                                    |

## Five-minute quickstart

This path starts from a clean clone, builds one Word document, builds one
editable PowerPoint plus its reconciliation map, and scaffolds a three-atom
visual suite:

```bash
git clone https://github.com/willackerly/office180-md-office-converter.git
cd office180-md-office-converter

corepack enable
pnpm install --frozen-lockfile
python3 -m venv .venv
.venv/bin/python -m pip install -e .
mkdir -p dist/quickstart/suite

.venv/bin/office180-md2docx --check examples/office180-primer.md
.venv/bin/office180-md2docx examples/office180-primer.md \
  --template themes/plum.json \
  --out dist/quickstart/office180-primer.docx

pnpm vector180 validate examples/minimal-diagram.vector180.svg
pnpm vector180 text-fit examples/minimal-diagram.vector180.svg \
  --font-map default
pnpm vector180 compile examples/minimal-diagram.vector180.svg \
  --placement 200,50,1200,800 --policy identity \
  --output dist/quickstart/minimal-diagram.pptx \
  --map dist/quickstart/minimal-diagram.vector180.map.json

pnpm vector180 new atom --output dist/quickstart/suite/overview.vector180.svg \
  --id overview --title "Overview"
pnpm vector180 new atom --output dist/quickstart/suite/workflow.vector180.svg \
  --id workflow --title "Workflow"
pnpm vector180 new atom --output dist/quickstart/suite/evidence.vector180.svg \
  --id evidence --title "Evidence"
pnpm vector180 metadata-compare \
  dist/quickstart/suite/overview.vector180.svg \
  dist/quickstart/suite/workflow.vector180.svg --format json
```

The suite comparison reports the scaffold's shared declared style family. That
is a useful grouping hint, not proof of an exact common template; verified
template lineage additionally requires immutable template-basis bytes. Run
`pnpm vector180 <command> --help` for a concise card for any subcommand.

Codex can also install the repository-owned skill bundle after cloning:

```bash
codex plugin marketplace add "$PWD"
codex plugin add office180@office180
```

Start a new Codex thread after plugin installation. Ask for a Word document,
DOCX, report, memo, or proposal to route to `$markdown-docx`; ask for a
PowerPoint, PPTX, presentation, slide deck, diagram, or figure to route to
`$vector180-authoring`.

The default visual source is a fully hydrated SVG atom: one self-contained
strict SVG with stable IDs, explicit geometry and hard lines, concrete local
styles, and no deck/runtime dependency. Keep a suite of diagrams as a suite of
atoms. Use HTML only for an actual deck/report or deck-only behavior; generated
`*.editable.html` files are wrappers, not source. A generated
`*.composed.vector180.html` is a valid one-slide deck artifact, but it never
replaces its source atom.

`Vector180` is the production-facing visual-format name. It names the
destination-neutral vector atom; PowerPoint is one important adapter, not the
identity of the source. The repository remains Office180 because it owns both
the Markdown/Word and Vector180/PowerPoint workflows.

PPTV is the frozen 0.1 legacy dialect. The `pptv` CLI and `@office180/pptv`
package remain available for exact historical artifacts. The canonical
`vector180` CLI is specified to permit bounded read projections and a
read-only editor wrapper for legacy sources, while refusing legacy source
mutation and PPTX/composition export. `migrate` writes a separate canonical
atom from one legacy SVG and proves semantic equivalence. The sole legacy-deck
write exception is `extract`, which hydrates one selected slide into a new
independently validated canonical atom; neither operation rewrites the legacy
source. Mixed PPTV/Vector180 namespaces are always an error.

> **Release-candidate status (2026-08-04):**
> `@office180/vector180@0.1.0-alpha.5` is implemented and has passed the
> current local package, repository, browser, packaging, and installed-style
> CLI acceptance paths. It is a local release candidate, not an npm-published
> release and not a blanket verification of every successor contract. C8 2.0
> is verified. C4–C7, C9–C12 retain their own `in-progress` acceptance
> matrices: C4/C12 still need complete conformance corpora; C5/C6 need their
> remaining cross-family and full-corpus locks; C7's complete durable
> OPC/XSD/independent-validity oracle and frozen-artifact gates remain open;
> C9/C10 retain family, counterexample, independent/native gates; and C11
> retains the manual native-edit and human-fidelity work described below. The
> frozen `@office180/pptv@0.1.0-alpha.4` remains the accepted legacy baseline.

## What ships and what is migrating

The repository has two Python command-line surfaces, one frozen accepted
TypeScript predecessor, and one implemented, locally test-accepted canonical
TypeScript release candidate, with no server:

- **`md2docx.py`** — converts Markdown to a styled `.docx`, themed by a JSON
  file. Headings, lists, tables, fenced code, inline formatting, blockquotes,
  and an optional marking-style banner all map to real Word styles.
- **`docx2md.py`** — converts that `.docx` back to canonical Markdown by
  inverting the same style choices. The supported profile has one canonical
  spelling, embeds exact original/canonical merge-base bytes, refuses unsafe
  Word constructs, emits a hash-bound fidelity report, and can three-way merge
  supported Word edits into independently changed canonical Markdown. It
  distinguishes bounded, proof-carrying Word whitespace/style normalization
  from actual controlled-style drift.
- **`@office180/pptv@0.1.0-alpha.4`** — the frozen accepted visual
  implementation and evidence baseline. It remains available for exact
  historical PPTV 0.1 artifacts and receives no new format features.
- **`@office180/vector180@0.1.0-alpha.5`** — the implemented, locally
  test-accepted release candidate. Its
  default visual atom is a strict, standalone `.vector180.svg` diagram. It also
  loads
  `.vector180.html` as a whole-deck aggregation, preserves stable IDs and exact
  source bytes, applies hash-bound direct-text/deck-control or typed
  native-object edits, applies
  theme/order edits to decks, resolves compiler-grade
  geometry/style/hard-line text, warns about exact-font overruns, hydrates any
  resolvable deck slide back into an independent SVG atom, and generates a
  writable trusted editor. Its Node boundary emits the C7 deck canary and the
  C9 standalone-atom path: explicit identity/uniform composition, native PPTX,
  complete sidecar map, and baseline-aware C10 patch proposal after supported
  PowerPoint edits. C5 2.0/C10 2.0 can additionally recover one explicitly
  reviewed same-parent connector copy through a hash/fingerprint-bound
  resolution document. It also projects inert template/style-family metadata,
  compares that metadata cheaply, and produces stable-ID semantic source
  diffs without treating metadata as rendering authority. The implementation
  and local automated distribution path are accepted as a release candidate;
  npm publication and the remaining contract-specific promotion rows are
  separate gates.

## PowerPoint design track

The same mapping and provenance ideas can support editable presentations. Start
with the **[Vector180 Design Index](VECTOR180-DESIGN-INDEX.md)**, then follow the focused
proposals:

C4–C10 intentionally retain `PPTV` in their stable historical contract IDs and
filenames so downstream references do not churn. Their 2.0 bodies define
Vector180; the old stem is not a current wire or package name.

- **[Vector180 PowerPoint Vector Profile](VECTOR180-PROFILE.md)** defines the constrained
  `.vector180.svg` atom with stable identities, native-versus-asset intent,
  DOM-order z-order, explicit no-reflow text, and exact source maps.
- **[Vector180 HTML Container](VECTOR180-HTML-CONTAINER.md)** proposes a portable
  manifest-first `.vector180.html` deck with inert slide templates, named themes,
  reusable definitions, and one fixed non-authoritative browser runtime.
- **[Vector180 Processing API](VECTOR180-PROCESSING-API.md)** specifies lazy scanning,
  source-range indexing, semantic projections, stable-ID transactional patches,
  serialization, diagnostics, caching, and agent-efficiency obligations.
- **[Vector180 Tooling and Editor Architecture](VECTOR180-TOOLING-AND-EDITOR.md)** defines
  a TypeScript-first toolchain, native SVG editor, optional
  `.editable.html` wrapper, and selective OpenDocKit reuse.
- **[Vector180 Deck Manuscript](VECTOR180-DECK-MANUSCRIPT.md)** banks a strict
  Markdown shell for ordered atom references, slide intent, and future
  PowerPoint speaker-note projection without duplicating visible slide text.
- **[Vector180 Implementation Plan](VECTOR180-IMPLEMENTATION-PLAN.md)** separates
  arbitrary-aspect standalone diagrams from the initial exact-16:9 PowerPoint
  deck profile, records the implemented mapped atom round trip, and sequences
  remaining native Office, editor, OpenDocKit, and profile-expansion gates.
- **[Vector180 0.1.1 Text Resilience](VECTOR180-TEXT-RESILIENCE-0.1.1.md)** banks the
  future paragraph-intent/export/import policy while keeping explicit SVG lines
  authoritative. It is a design milestone, not current runtime or npm support.
- **[SVG to Editable PowerPoint playbook](SVG-TO-EDITABLE-PPTX.md)** documents
  the reconstruction, stable-object-ID, round-trip diff, render QA, and native
  PowerPoint validation workflow that motivated the profile.
- **[`examples/minimal-diagram.vector180.svg`](examples/minimal-diagram.vector180.svg)**
  is the smallest first-class diagram atom; the two-slide
  **[`examples/minimal-deck.vector180.html`](examples/minimal-deck.vector180.html)**
  demonstrates aggregation, theme/order editing, extraction, and the current
  C7 canary subset.

C4/C5 2.0 define both first-class standalone atoms and HTML decks. C6 2.0
defines a fail-closed resolved model: atoms keep an arbitrary finite positive
logical `viewBox`, while deck slides retain the exact `0 0 1600 900` physical
PowerPoint mapping. Those surfaces are implemented in the alpha.5 candidate;
C4–C6 remain `in-progress` until their own complete canonical/legacy/mixed-
family and corpus rows close. The frozen predecessor already proved the
underlying exact-source kernel under its PPTV identities, but that historical
proof does not substitute for the remaining Vector180 acceptance rows.

C7 2.0 remains intentionally deck-only and carries the strict primitive
fresh-PPTX canary forward. Its predecessor's checked minimal artifact passed
ISO/ECMA schema validation, independent OpenDocKit reopen, and native
PowerPoint open/render without repair; OpenDocKit also independently reopened
the predecessor's native-saved C9 artifact. The alpha.5 C7 implementation has
canonical envelope/refusal and separate-process/time-zone determinism
coverage, but its complete durable OPC/XSD/independent-validity oracle and
frozen-artifact gates still govern promotion; do not infer C7 acceptance from
a generated PPTX alone. C8 2.0 is verified with anchor-aware, no-reflow
evidence and the package-owned ABeeZee default.

C9 2.0 defines explicit identity or aspect-preserving uniform atom placement,
deterministic one-slide composition, a supported editable native PPTX, and a
hash-bound object map. C10 2.0 defines authentication of that exact branch and
translation of the supported DrawingML edit subset into reviewable
`vector180-patch/0.1` operations.
One exact reviewed connector copy may produce a `vector180-patch/0.1`
`clone-connector`; duplicates still refuse by default, and ambiguous or
multiply changed copies produce rich recovery options with no partial patch.
The alpha.5 candidate proves a substantial bounded canonical path, including
typed apply/recompile/reinspect evidence. C9 and C10 nevertheless remain
`in-progress` until their remaining family matrices, normalization
counterexamples, and independent/native gates close. This is not arbitrary
PPTX import.

C11 defines browser/Quick Look capture and quantitative comparison for both
Office lanes plus a bounded macOS native bridge. On 2026-08-02 the predecessor
evidence bridge passed exact-path no-op save, close, reopen, and close
lifecycles for
Word and PowerPoint 16.111.2; both saved packages reopened without repair,
retained their post-save hashes, and rendered with zero same-renderer pixel
change against the checked baselines. That closes structural lifecycle
evidence only. Representative user edits, native text calibration,
native/cross-renderer fidelity, and human review remain explicit promotion
gates.

The reproducible checked bundles are
[`tests/fixtures/roundtrip-evidence/docx/`](tests/fixtures/roundtrip-evidence/docx/),
[`tests/fixtures/roundtrip-evidence/pptv/`](tests/fixtures/roundtrip-evidence/pptv/),
and the durable canonical
[`tests/fixtures/roundtrip-evidence/vector180/`](tests/fixtures/roundtrip-evidence/vector180/).
The Vector180 bundle is SHA-locked and privacy-checked; it records
exact-font preflight, browser and Quick Look captures, a deterministic
three-operation DrawingML edit simulation, C10 recovery, C9 regeneration,
byte-identical edited/regenerated slide XML, and zero changed Quick Look
pixels between those two artifacts. The simulation is not a native
PowerPoint edit. Native representative edit/save/reopen and a hash-bound human
fidelity review remain explicitly manual. The PPTV path remains because it is
immutable legacy evidence, not a canonical authoring example.

### Focused Office authoring skills

Codex discovers two versioned workflows from `.agents/skills/`:

- [`$markdown-docx`](.agents/skills/markdown-docx/SKILL.md) for a Word
  document, DOCX, report, memo, or proposal. Start from its
  [canonical Markdown starter](.agents/skills/markdown-docx/assets/starter.md),
  use the [one-page Word card](.agents/skills/markdown-docx/references/word-card.md)
  for routine conversion, and follow the
  [recovery and merge guide](.agents/skills/markdown-docx/references/recovery-and-merge.md)
  before reconciling Word edits. Markdown remains authority; the DOCX is a
  reviewable branch.
- [`$vector180-authoring`](.agents/skills/vector180-authoring/SKILL.md) for a
  PowerPoint, PPTX, presentation, slide deck, diagram, figure, or
  reusable visual. It defaults to a standalone atom for one visual and to HTML
  only for an actual multi-slide deck/report. Use it to choose stable
  groups/IDs/text frames, run exact-font overflow preflight, edit or extract
  atoms, compose/compile a mapped atom PPTX, reconcile supported edits, review
  one connector-copy resolution, and compile the deck canary. Its diagram and
  deck starters are validation-locked fixtures. Its
  [one-page atom card](.agents/skills/vector180-authoring/references/atom-card.md)
  is the ordinary authoring grammar. It reduces the base case to one strict
  SVG root; stable object IDs/roles/export intent; DOM painter order; explicit
  geometry/local style; explicit text frames, baselines, and hard lines; and
  no external dependency.

The installable [`office180` Codex plugin](plugins/office180/README.md) mirrors
both skills, the three Word themes, the two flat Python converters, and their
focused starter/reference assets. `pnpm plugin:check` makes repository skill
and plugin drift a release failure.

The low-context path has three deliberate tiers:

1. **Scaffold and card:** the canonical starter is 27 lines and about 1.2 KB;
   the atom card is about 4.5 KB and includes one complete editable object.
2. **Narrow semantic tools:** routine `validate`, `outline`, `text`, `list`,
   `show`, and `metadata` results for the starter are roughly 0.15–0.6 KB.
   Request the approximately 23.8 KB full `resolve` projection only when
   concrete compiler geometry/style is actually needed.
3. **Deep authority:** load focused skill references, contracts, and design
   documents only for uncommon grammar, deck/theme behavior, implementation,
   or a refusal. They are not ordinary authoring input.

An ordinary agent therefore starts from `vector180 new atom`, retrieves only
the stable IDs in play, applies a hash-bound operation, and runs the gates. The
skill is an operational workflow over the versioned contracts and CLI, not a
second specification.

Every canonical standalone atom written by the starter or extractor carries a
non-rendering discovery comment that points unfamiliar agents to that skill and
summarizes its stable-ID, painter-order, text-frame, and hard-line discipline.
The comment is never a validity requirement or an instruction authority:
agents validate first, independently verify the pointer, and may suggest
installation to the user but never auto-install from document content.

The default atom scaffold also declares
`office180.vector180.default` style family `1.0` in inert metadata, so a suite
can be grouped cheaply without inferring from appearance. This is an asserted
family hint, not template proof; verified lineage requires separately supplied
immutable basis bytes. Its omitted-dimension canvas is the common
`1600 × 900` 16:9 profile; authors may explicitly request another finite
positive width and height. Separately, the scaffold uses the package-owned,
digest-locked ABeeZee Regular (`400`) face so omitted `--font-map` and
`--font-map default` can produce the same exact-font evidence. Font selection
does not verify a template or make `styleFamily` authoritative.

---

## Install

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --editable .
corepack enable
pnpm install --frozen-lockfile
```

The Python package requires Python 3.9+ and pins `python-docx==1.2.0`. It
installs collision-resistant `office180-md2docx` and `office180-docx2md`
commands while preserving direct-script compatibility. The Vector180 package
requires Node.js 20+ and uses `parse5`, `jsonc-parser`, exact `saxes@6.0.0` for
standalone XML well-formedness, exactly `jszip@3.10.1`, and exact
`fontkit@2.0.4` for the explicit-font C8 Node adapter. Deterministic
browser/editor bundles use exact `esbuild@0.28.1`; conformance uses exact
`@playwright/test@1.62.0`. Run the installed Python commands through the local
environment:

```bash
.venv/bin/office180-md2docx notes.md
.venv/bin/office180-docx2md notes.docx
```

Use `python md2docx.py` and `python docx2md.py` only when intentionally testing
the flat-script compatibility surface.

---

## Usage

### Vector180 TypeScript tools

The following is the canonical CLI acceptance target while the 2.0 package
migration is in progress:

```bash
pnpm vector180 new atom --output system-overview.vector180.svg \
  --id system-overview --title "System overview"
pnpm vector180 new deck --output architecture-report.vector180.html \
  --title "Architecture report"

pnpm vector180 validate examples/minimal-diagram.vector180.svg
pnpm vector180 outline examples/minimal-diagram.vector180.svg
pnpm vector180 resolve examples/minimal-diagram.vector180.svg
pnpm vector180 editor-pack examples/minimal-diagram.vector180.svg \
  --output minimal-diagram.editable.html
pnpm vector180 compile examples/minimal-diagram.vector180.svg \
  --placement 0,0,1200,800 --policy identity \
  --output minimal-diagram.pptx --map minimal-diagram.vector180.map.json
pnpm vector180 compose examples/minimal-diagram.vector180.svg \
  --placement 0,0,1200,800 --policy identity \
  --output minimal-diagram.composed.vector180.html
pnpm vector180 reconcile minimal-diagram.edited.pptx \
  --source examples/minimal-diagram.vector180.svg \
  --baseline minimal-diagram.vector180.map.json \
  --patch recovered.vector180.patch.json --report reconciliation.json
pnpm vector180 patch examples/minimal-diagram.vector180.svg \
  recovered.vector180.patch.json --output minimal-diagram.recovered.vector180.svg

pnpm vector180 outline examples/minimal-deck.vector180.html
pnpm vector180 validate examples/minimal-deck.vector180.html
pnpm vector180 resolve examples/minimal-deck.vector180.html
pnpm vector180 extract examples/minimal-deck.vector180.html \
  --slide architecture --output architecture.vector180.svg
pnpm vector180 editor-pack examples/minimal-deck.vector180.html \
  --output minimal-deck.editable.html
pnpm vector180 pptx-canary examples/minimal-deck.vector180.html \
  --output minimal-deck.pptx
pnpm vector180 text-fit examples/minimal-deck.vector180.html \
  --font-map default
pnpm vector180 text examples/minimal-deck.vector180.html --slide cover --format json
pnpm vector180 show examples/minimal-deck.vector180.html cover.title --view editing
pnpm vector180 list examples/minimal-deck.vector180.html --role connector

pnpm vector180 metadata examples/minimal-diagram.vector180.svg --format json
pnpm vector180 metadata-compare left.vector180.svg right.vector180.svg \
  --format json
pnpm vector180 metadata-compare left.vector180.svg right.vector180.svg \
  --template-basis templates/card-basis.svg --format json
pnpm vector180 diff left.vector180.svg right.vector180.svg --format json

pnpm vector180 migrate legacy.pptv.svg \
  --output legacy.vector180.svg --report migration.json
```

`compile` is the normal one-atom PowerPoint path. Run `compose` only when the
generated one-slide HTML aggregation is itself useful; it is not a prerequisite
for compilation and does not replace the atom.

`metadata` is the cheapest way to identify hydration provenance,
template lineage, and asserted style family. `metadata-compare` answers whether
two atoms declare the same families. Equal lineage hashes remain asserted
unless the caller supplies the exact immutable template-basis bytes with
`--template-basis`; only a hash match against both declarations is verified.
`diff` validates two standalone SVG atoms and joins objects by stable ID,
reporting semantic text, geometry, style, relationship, order, add, and remove
changes separately from lexical-only source differences.

Patches are bound to the source SHA-256 and are all-or-nothing. The CLI never
overwrites implicitly:

```bash
pnpm vector180 patch deck.vector180.html change.vector180.patch.json --check
pnpm vector180 patch deck.vector180.html change.vector180.patch.json \
  --output deck.updated.vector180.html
```

`vector180-patch/0.1` is one vocabulary: direct-text transactions for
atoms/decks; active-theme and slide-order transactions for decks; exact
old-value-preconditioned geometry, connector, group-translation, direct text
frame, sibling-order, safe-deletion, and complete native-style operations; and
one structural exception, cloning one existing native straight connector into
the same parent with a fresh stable ID, explicit from/to references, exact
geometry/style, and complete sibling order.
`editor-pack`
embeds inert exact bytes under strict CSP, verifies the source hash, reconstructs
only from literal C6 data, and commits through the same C5 session for exact
undo/redo. It exports current clean source rather than wrapper DOM; supported
browsers can save through a user-selected file handle with subsequent stale
disk detection. Generated `*.editable.html` wrappers are ignored build
artifacts; `*.editable.vector180.html` remains ignored as a compatibility
spelling but is not a public name. A composed `*.composed.vector180.html` is a
valid generated deck artifact; the original atom remains its source authority.

An embedded HTML-deck slide may depend on deck CSS/theme context. `extract`
therefore does not byte-slice blindly: it resolves that context, writes
concrete local presentation values, removes deck-only authority, reloads and
resolves the candidate as a standalone diagram, and emits nothing on failure.
External manifests, CSS token editing, rich-text/general insertion/reparenting,
general SVG/PPTX conversion, and baseline-free PPTX import remain outside the
supported surface. The exact reviewed connector clone above is the only
insertion exception. C9 composition requires an explicit transform/scaling
policy and fails on aspect mismatch—never a silent stretch. C10 refuses
ambiguous or unsupported edits and never overwrites source or PPTX. See
[`packages/vector180/README.md`](packages/vector180/README.md).

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

| Theme                     | Description                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `themes/neutral.json`     | The built-in defaults, as a documented, diffable file                                               |
| `themes/plum.json`        | A purple-accented house style                                                                       |
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
are the subject of `architecture/CONTRACT-C1-THEME-SCHEMA.1.1.md`. JSONC
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
the forward converter applies Word styles as a _deterministic function_ of
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
office180-md2docx --normalize draft.md > canonical.candidate.md
office180-md2docx --check canonical.candidate.md
office180-md2docx canonical.candidate.md --out review.docx
office180-docx2md review.docx \
  --out edited.md --base-out embedded-base.md --report fidelity.json
office180-docx2md review.docx \
  --merge-current canonical.md --out merged.md \
  --base-out embedded-base.md --report merge.json
```

Pending tracked changes, images, text boxes, unknown styles, nested lists,
native numbering, and unsupported Markdown constructs refuse with stable codes
instead of being flattened. Google Docs may strip the merge-base part, and
links retain the documented print-oriented demotion rather than becoming real
hyperlinks. The bounded native bridge has passed an exact Word 16.111.2 no-op
save/reopen lifecycle on this host. That save recovered byte-identical
Markdown and proved Word's omitted Heading 1–4 font/italic declarations
equivalent through the exact style cascade; nearby theme, base, link, and
inheritance counterexamples still report drift. Representative supported Word
edits and human/native visual review remain separate gates. See
`architecture/CONTRACT-C3-ROUNDTRIP.1.2.md`.

**DOCX roadmap:** `ROADMAP.md` is the remaining hand-off plan — a pinned
CommonMark AST, wide-table strategies, image support, JSONC themes with an
`extends` chain, real hyperlinks, and broader symmetry fixtures. The exact
canonical, embedded-source, refusal/report, and three-way-merge foundation is
implemented.

**PowerPoint roadmap:** `VECTOR180-DESIGN-INDEX.md` is the entry point for the
broader SVG/HTML source model, processing API, native editor, PowerPoint
adapter, reverse-patch semantics, and conformance path. Alpha.5 is the
implemented, locally test-accepted package candidate and C8 2.0 is verified;
C4–C7 and C9–C12 remain `in-progress` until their contract-specific rows close.
Frozen predecessor artifacts retain the already checked PPTV
source/patch/resolution, strict deck canary, mapped atom round trip, and exact
no-op native Office lifecycle evidence. Remaining work includes the open
conformance matrices, representative native user edits, native
text/cross-renderer calibration, browser controls for the typed operation
surface, richer assets/text, and separately versioned profile expansion—not
arbitrary best-effort PPTX conversion.
`VECTOR180-DECK-MANUSCRIPT.md` banks the Markdown narrative/speaker-note shell,
and `VECTOR180-BRANDED-TEMPLATE-BASIS.md` defines the privacy-safe path from a
reference deck to a small set of exact-lineage, content-free SVG bases.

---

## Development

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --editable .
corepack enable
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test                          # Vector180, frozen PPTV, DOCX, and installed-package suites
pnpm build
pnpm legacy:build                  # keep the frozen PPTV predecessor buildable
pnpm pack:check                    # verify the publishable Vector180 package contents
python3 scripts/sync-office180-plugin.py --check
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
