# Vector180 atom card

Use this page for ordinary diagram, figure, and slide-sized atom work. The
versioned contracts remain authoritative, but an author normally needs only
this grammar plus the CLI gates.

## The source shape

A canonical atom is one self-contained `*.vector180.svg` file:

- root `<svg>` has a stable `id`, `data-vector180-version="0.1"`, one finite
  positive `viewBox`, and the SVG namespace;
- every rendered object has a unique stable `id`,
  `data-vector180-role`, and `data-vector180-export`;
- SVG sibling order is painter order;
- geometry, styling, text frames, and line breaks are explicit;
- no external resource, script, event handler, `foreignObject`, runtime, or
  deck theme is needed to interpret it; and
- the scaffold's direct-child metadata is only a declared style-family hint.

Use the smallest roles that state intent:

| Object     | Common element        | Required intent                                  |
| ---------- | --------------------- | ------------------------------------------------ |
| Shape      | `rect`, `ellipse`     | `role="shape"`, usually `export="native"`        |
| Text       | `text`                | `role="text"`, explicit frame and line step      |
| Connector  | `line`                | `role="connector"`, explicit `from`/`to` IDs     |
| Group      | `g`                   | `role="group"`, translated only when transformed |
| Atomic art | supported SVG subtree | `export="asset"` with explicit bounds            |

Prefer native shapes/text/connectors. Use `asset` only when the artwork should
remain one atomic vector image in PowerPoint.

## One example object

This group is a complete editable card. Its child IDs remain globally unique,
the rectangle paints before the text, and the hard line is authoritative.

```xml
<g id="system.api"
   data-vector180-role="group"
   data-vector180-export="native"
   transform="translate(80 120)">
  <rect id="system.api.box"
        data-vector180-role="shape"
        data-vector180-export="native"
        x="0" y="0" width="360" height="180"
        fill="#e4f2ec" stroke="#24735d" stroke-width="3"/>
  <text id="system.api.title"
        data-vector180-role="text"
        data-vector180-export="native"
        data-vector180-frame="28 32 304 52"
        data-vector180-line-step="34"
        x="28" y="69"
        fill="#17211e"
        font-family="ABeeZee"
        font-size="28"
        font-weight="400">Policy API</text>
</g>
```

A straight connector names the logical endpoint objects as well as its exact
line geometry:

```xml
<line id="system.api-to-store"
      data-vector180-role="connector"
      data-vector180-export="native"
      data-vector180-from="system.api"
      data-vector180-to="system.store"
      x1="440" y1="210" x2="680" y2="210"
      stroke="#576b64" stroke-width="4"/>
```

## Text never reflows

- `data-vector180-frame="x y width height"` declares the audit/export box.
- `data-vector180-line-step` declares the baseline step.
- `x`/`y` and direct text or direct `<tspan>` children declare exact baselines.
- One authored line stays one authored line. Do not enable autofit or infer
  browser wrapping.
- Use ABeeZee Regular (`font-weight="400"`) unless a separately verified exact
  font map is part of the job.
- Leave deliberate horizontal margin. A visible edge overrun is preferable to
  an unexpected word moving to another line.

## Create and interrogate

```bash
pnpm vector180 new atom --output diagram.vector180.svg \
  --id diagram --title "Diagram"
pnpm vector180 validate diagram.vector180.svg --format json
pnpm vector180 outline diagram.vector180.svg --format json
pnpm vector180 list diagram.vector180.svg --role text --format jsonl
pnpm vector180 text-fit diagram.vector180.svg --font-map default
```

Use `show ID` for one object and `resolve` only when concrete geometry/style is
needed. Run `pnpm vector180 patch --help` for the minimal `set-text` envelope;
its exact source hash and `oldText` preconditions make stale edits fail
atomically. Validate and resolve the whole candidate after a patch. Use `diff`
for two standalone atoms; use `reconcile` for an edited mapped PPTX.

## Stop and read the fuller reference when

Read `authoring-profile.md` before using an element or transform not shown
here, authoring an opaque asset, changing source dialect, working with an HTML
deck/theme, or interpreting a validator refusal. Read `text-fit.md` for
multiple lines, custom fonts, near-edge text, or PowerPoint export.
