// Architecture: CONTRACT:C4-PPTV-SOURCE.1.0

(() => {
  "use strict";

  const payloadNode = document.querySelector("#pptv-editor-payload");
  const payload = JSON.parse(payloadNode.textContent);
  const sourceBytes = decodeBase64(payload.sourceBase64);
  const sourceText = new TextDecoder("utf-8", {
    fatal: true,
    ignoreBOM: true,
  }).decode(sourceBytes);

  const title = document.querySelector("[data-title]");
  const hash = document.querySelector("[data-hash]");
  const status = document.querySelector("[data-integrity]");
  const slides = document.querySelector("[data-slides]");
  const tree = document.querySelector("[data-tree]");
  const viewport = document.querySelector("[data-viewport]");
  const inspector = document.querySelector("[data-inspector]");
  const diagnostics = document.querySelector("[data-diagnostics]");
  const source = document.querySelector("[data-source]");

  title.textContent = payload.title || payload.downloadName;
  hash.textContent = payload.sourceSha256;
  source.value = sourceText;

  let selectedSlide = payload.outline.slides[0]?.id;
  let selectedObject;

  document.querySelector("[data-download]").addEventListener("click", () => {
    const blob = new Blob([sourceBytes], {
      type: "text/html;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = payload.downloadName;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  verifyIntegrity().catch((error) => {
    status.textContent = `Hash check failed: ${error.message}`;
    status.dataset.ok = "false";
  });
  render();

  async function verifyIntegrity() {
    const digest = await crypto.subtle.digest("SHA-256", sourceBytes);
    const actual = Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    const ok = actual === payload.sourceSha256;
    status.textContent = ok ? "source hash verified" : "source hash mismatch";
    status.dataset.ok = String(ok);
  }

  function render() {
    renderSlides();
    renderTree();
    renderViewport();
    renderInspector();
    renderDiagnostics();
  }

  function renderSlides() {
    slides.replaceChildren(
      ...payload.outline.slides.map((slide, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.className = "slide-button";
        button.type = "button";
        button.ariaCurrent = String(slide.id === selectedSlide);
        button.textContent = `${index + 1}. ${slide.id}${slide.hidden ? " (hidden)" : ""}`;
        button.addEventListener("click", () => {
          selectedSlide = slide.id;
          selectedObject = undefined;
          render();
        });
        item.append(button);
        return item;
      }),
    );
  }

  function renderTree() {
    const slide = payload.inventory.slides.find(
      (candidate) => candidate.id === selectedSlide,
    );
    tree.replaceChildren(
      ...(slide?.objects || []).map((object) => objectTree(object)),
    );
  }

  function objectTree(object) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "object-button";
    button.type = "button";
    button.ariaCurrent = String(object.id === selectedObject);
    button.textContent = `${object.id} · ${object.role}`;
    button.addEventListener("click", () => {
      selectedObject = object.id;
      render();
    });
    item.append(button);
    if (object.children?.length) {
      const children = document.createElement("ul");
      children.className = "object-children";
      children.append(...object.children.map((child) => objectTree(child)));
      item.append(children);
    }
    return item;
  }

  function renderViewport() {
    const slide = payload.resolved.slides.find(
      (candidate) => candidate.id === selectedSlide,
    );
    if (!slide) {
      viewport.replaceChildren();
      return;
    }
    const svg = svgElement("svg");
    svg.classList.add("pptv-preview");
    svg.setAttribute("viewBox", payload.resolved.canvas.viewBox.join(" "));
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Resolved slide ${slide.id}`);
    for (const object of slide.objects) {
      const rendered = renderResolvedObject(object);
      if (rendered) svg.append(rendered);
    }
    viewport.replaceChildren(svg);
  }

  function renderResolvedObject(object) {
    let element;
    if (object.kind === "group") {
      element = svgElement("g");
      element.setAttribute(
        "transform",
        `translate(${object.translateX} ${object.translateY})`,
      );
      for (const child of object.children) {
        const rendered = renderResolvedObject(child);
        if (rendered) element.append(rendered);
      }
    } else if (object.kind === "rect") {
      element = svgElement("rect");
      setAttributes(element, {
        x: object.x,
        y: object.y,
        width: object.width,
        height: object.height,
        rx: object.rx,
        ry: object.ry,
      });
      applyStyle(element, object.style);
    } else if (object.kind === "ellipse") {
      element = svgElement("ellipse");
      setAttributes(element, {
        cx: object.cx,
        cy: object.cy,
        rx: object.rx,
        ry: object.ry,
      });
      applyStyle(element, object.style);
    } else if (object.kind === "line") {
      element = svgElement("line");
      setAttributes(element, {
        x1: object.x1,
        y1: object.y1,
        x2: object.x2,
        y2: object.y2,
      });
      applyStyle(element, object.style);
    } else if (object.kind === "text") {
      element = svgElement("text");
      applyStyle(element, object.style);
      for (const line of object.lines) {
        const tspan = svgElement("tspan");
        setAttributes(tspan, { x: line.x, y: line.y });
        tspan.textContent = line.text;
        element.append(tspan);
      }
    } else if (object.kind === "svg-asset") {
      element = svgElement("g");
      const boundary = svgElement("rect");
      setAttributes(boundary, object.localBounds);
      boundary.setAttribute("fill", "none");
      boundary.setAttribute("stroke", "#8d7cff");
      boundary.setAttribute("stroke-width", "2");
      boundary.setAttribute("stroke-dasharray", "8 6");
      element.append(boundary);
    } else {
      return undefined;
    }
    element.dataset.pptvObjectId = object.id;
    element.dataset.selected = String(object.id === selectedObject);
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      selectedObject = object.id;
      render();
    });
    return element;
  }

  function applyStyle(element, style) {
    setAttributes(element, {
      fill: style.fill,
      stroke: style.stroke,
      "stroke-width": style.strokeWidth,
      opacity: style.opacity,
      "font-family": style.fontFamily,
      "font-size": style.fontSize,
      "font-weight": style.fontWeight,
      "font-style": style.fontStyle,
      "text-anchor": style.textAnchor,
    });
  }

  function setAttributes(element, attributes) {
    for (const [name, value] of Object.entries(attributes)) {
      if (value !== undefined) element.setAttribute(name, String(value));
    }
  }

  function svgElement(name) {
    return document.createElementNS("http://www.w3.org/2000/svg", name);
  }

  function renderInspector() {
    const object = findResolvedObject(selectedObject);
    const slide = payload.outline.slides.find(
      (candidate) => candidate.id === selectedSlide,
    );
    const values = object
      ? [
          ["Stable ID", object.id],
          ["Kind", object.kind],
          ["Parent", object.parentId || "slide"],
          [
            "Bounds",
            `${object.worldBounds.x}, ${object.worldBounds.y}, ${object.worldBounds.width} × ${object.worldBounds.height}`,
          ],
          [
            "Text",
            object.kind === "text"
              ? object.lines.map((line) => line.text).join("\n")
              : "—",
          ],
        ]
      : [
          ["Slide", slide?.id || "—"],
          ["Layout", slide?.layout || "—"],
          ["Hidden", String(slide?.hidden || false)],
          ["Theme", payload.outline.activeTheme || "—"],
        ];
    const list = document.createElement("dl");
    for (const [label, value] of values) {
      const term = document.createElement("dt");
      const detail = document.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      list.append(term, detail);
    }
    inspector.replaceChildren(list);
  }

  function renderDiagnostics() {
    const entries = payload.diagnostics.length
      ? payload.diagnostics
      : [
          {
            code: "PPTV-EDITOR-READY",
            message:
              "Exact source and semantic inventory loaded. This first wrapper shell is read-only; host editing uses the packaged C5 session layer.",
          },
        ];
    diagnostics.replaceChildren(
      ...entries.map((entry) => {
        const item = document.createElement("li");
        item.className = "diagnostic";
        item.textContent = `${entry.code}: ${entry.message}`;
        return item;
      }),
    );
  }

  function findResolvedObject(id) {
    if (!id) return undefined;
    const slide = payload.resolved.slides.find(
      (candidate) => candidate.id === selectedSlide,
    );
    const pending = [...(slide?.objects || [])];
    while (pending.length) {
      const candidate = pending.shift();
      if (candidate.id === id) return candidate;
      if (candidate.kind === "group") pending.unshift(...candidate.children);
    }
    return undefined;
  }

  function decodeBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
})();
