# Office180 Codex plugin

Office180 gives Codex two focused authoring routes:

- `$markdown-docx` for Word documents, DOCX files, reports, memos, and
  proposals. Canonical Markdown remains authority; DOCX is a styled,
  reviewable branch.
- `$vector180-authoring` for PowerPoint, PPTX, presentations, slide decks,
  diagrams, and reusable visuals. A fully hydrated, no-reflow
  `*.vector180.svg` atom remains authority; PPTX is an editable branch.

Mixed Office requests may invoke both skills, but each artifact keeps its own
source authority. The plugin does not invent a combined format.

## Install from this checkout

From the repository root:

```bash
codex plugin marketplace add "$PWD"
codex plugin add office180@office180
```

Start a new Codex thread after installation so the two skills are
rediscovered.

To consume the marketplace directly from GitHub:

```bash
codex plugin marketplace add willackerly/office180-md-office-converter --ref main
codex plugin add office180@office180
```

The GitHub route installs the repository state selected by `--ref`; pin a
commit or release tag instead of `main` when the installation must be
reproducible.

## What is bundled

- the Markdown/DOCX and Vector180 authoring skills;
- the canonical Markdown, standalone SVG atom, and HTML deck starters;
- the concise Word and Vector180 reference cards;
- the neutral, plum, and marked-document Word themes; and
- exact copies of the two flat Python DOCX converters.

The bundled Python lane requires Python 3.9+ and `python-docx==1.2.0`.
Vector180 currently remains a locally packaged, unpublished Node.js release
candidate. PowerPoint production therefore requires the containing repository
checkout, Node.js 20+, pnpm 10.20.0, and its locked dependencies. Publishing
the runtime is a separate release gate; plugin installation never claims that
publication already happened.

Plugin installation does not install Python or Node dependencies. Prepare the
containing checkout once:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --editable .
corepack enable
pnpm install --frozen-lockfile
```

## Maintainer synchronization

Repository-scoped skills and top-level themes are authority. Regenerate the
plugin mirrors after changing them:

```bash
python3 scripts/sync-office180-plugin.py
python3 scripts/sync-office180-plugin.py --check
```

The mirrored converter scripts remain byte-identical to `md2docx.py` and
`docx2md.py`. Behavioral authority remains in the repository contracts,
schemas, and tests.
