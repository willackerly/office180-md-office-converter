#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Bounded capture and comparison harness for Office visual evidence.

CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.0

This slice captures trusted DOCX/PPTX previews with macOS Quick Look and
trusted validated standalone PPTV SVG atoms through loopback Playwright
Chromium. It compares already-captured images with deterministic thresholds
and optional masks and validates content-bound evidence manifests. Quick Look
and browser captures remain preview evidence; neither is reported as native
Word or PowerPoint open, edit, save, or reopen evidence.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import locale
import os
import platform
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterable


SCHEMA_ID = "office180-visual-evidence/0.1"
CONTRACT_ID = "CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.0"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
STATUSES = {"passed", "failed", "unavailable", "manual-required"}
RENDERER_CLASSES = {
    "quick-look",
    "browser",
    "opendockit",
    "libreoffice",
    "pdf-rasterizer",
    "native-word",
    "native-powerpoint",
    "manual",
    "other",
}
EMPTY_SHA256 = hashlib.sha256(b"").hexdigest()
DEFAULT_ROOT = Path(__file__).resolve().parent.parent
BROWSER_CAPTURE_HELPER = Path(__file__).resolve().with_name(
    "capture-browser-svg.mjs"
)
BROWSER_MAX_DIMENSION = 4096
BROWSER_MAX_PIXELS = 16_777_216
BROWSER_RENDERING_FLAGS = (
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-domain-reliability",
    "--disable-features=MediaRouter",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE 127.0.0.1",
)
OPAQUE_HEX_COLOR_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


class VisualEvidenceError(RuntimeError):
    """Stable-code failure raised before an evidence result can be produced."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code

    def __str__(self) -> str:
        return f"{self.code}: {super().__str__()}"


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def evidence_sha256(manifest: dict[str, Any]) -> str:
    payload = copy.deepcopy(manifest)
    payload.pop("evidence_sha256", None)
    return sha256_bytes(canonical_json_bytes(payload))


def finalize_evidence(manifest: dict[str, Any]) -> dict[str, Any]:
    finalized = copy.deepcopy(manifest)
    finalized.pop("evidence_sha256", None)
    finalized["evidence_sha256"] = evidence_sha256(finalized)
    return finalized


def _is_digest(value: Any) -> bool:
    return isinstance(value, str) and bool(SHA256_RE.fullmatch(value))


def _is_relative_path(value: Any) -> bool:
    if not isinstance(value, str) or not value or "\\" in value or "~" in value:
        return False
    path = PurePosixPath(value)
    return not path.is_absolute() and ".." not in path.parts and value != "."


def _resolve_relative(root: Path, value: str) -> Path:
    if not _is_relative_path(value):
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"path must be repository-relative: {value!r}",
        )
    resolved_root = root.resolve()
    resolved = (resolved_root / PurePosixPath(value)).resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError as exc:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-UNSAFE-INPUT",
            f"path escapes authorized root: {value!r}",
        ) from exc
    return resolved


def _relative_path(root: Path, path: Path) -> str:
    resolved_root = root.resolve()
    resolved = path.resolve()
    try:
        return resolved.relative_to(resolved_root).as_posix()
    except ValueError as exc:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-UNSAFE-INPUT",
            f"path is outside authorized root: {path}",
        ) from exc


def _require_keys(
    value: Any,
    path: str,
    required: set[str],
    optional: set[str],
    errors: list[str],
) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        errors.append(f"{path}: expected object")
        return None
    missing = sorted(required - value.keys())
    unknown = sorted(value.keys() - required - optional)
    for key in missing:
        errors.append(f"{path}: missing {key}")
    for key in unknown:
        errors.append(f"{path}: unknown property {key}")
    return value


def _check_digest(value: Any, path: str, errors: list[str]) -> None:
    if not _is_digest(value):
        errors.append(f"{path}: expected lowercase sha256")


def _check_relative_path(value: Any, path: str, errors: list[str]) -> None:
    if not _is_relative_path(value):
        errors.append(f"{path}: expected repository-relative path")


def _all_strings(value: Any) -> Iterable[str]:
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for item in value.values():
            yield from _all_strings(item)
    elif isinstance(value, list):
        for item in value:
            yield from _all_strings(item)


def _privacy_errors(manifest: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    private_tokens = {str(Path.home())}
    hostname = platform.node()
    if hostname:
        private_tokens.add(hostname)
    for value in _all_strings(manifest):
        if any(ord(char) < 0x20 and char not in "\t\n\r" for char in value):
            errors.append("privacy: control character in string")
        for token in private_tokens:
            if token and token != "/" and token in value:
                errors.append("privacy: manifest contains a home path or hostname")
                break
    return errors


def _validate_capture(capture: Any, errors: list[str]) -> None:
    obj = _require_keys(
        capture,
        "capture",
        {
            "renderer_class",
            "status",
            "diagnostic",
            "renderer",
            "environment",
            "fonts",
            "input",
            "command",
            "output",
        },
        set(),
        errors,
    )
    if obj is None:
        return
    if obj.get("renderer_class") not in RENDERER_CLASSES:
        errors.append("capture.renderer_class: unsupported class")
    status = obj.get("status")
    if status not in STATUSES:
        errors.append(
            "capture.status: expected passed/failed/unavailable/manual-required"
        )
    diagnostic = obj.get("diagnostic")
    if status == "passed" and diagnostic is not None:
        errors.append("capture.diagnostic: pass must not have a diagnostic")
    if status in {"failed", "unavailable", "manual-required"} and not (
        isinstance(diagnostic, str) and diagnostic
    ):
        errors.append("capture.diagnostic: non-pass status requires a diagnostic")

    renderer = _require_keys(
        obj.get("renderer"),
        "capture.renderer",
        {"product", "version", "executable_path"},
        {"identity_sha256"},
        errors,
    )
    if renderer is not None:
        for key in ("product", "version", "executable_path"):
            if not isinstance(renderer.get(key), str) or not renderer[key]:
                errors.append(f"capture.renderer.{key}: expected non-empty string")
        if "identity_sha256" in renderer:
            _check_digest(
                renderer.get("identity_sha256"),
                "capture.renderer.identity_sha256",
                errors,
            )

    environment = _require_keys(
        obj.get("environment"),
        "capture.environment",
        {"os", "os_version", "architecture", "locale", "display_scale"},
        {"rendering_flags"},
        errors,
    )
    if environment is not None:
        for key in ("os", "os_version", "architecture", "locale"):
            if not isinstance(environment.get(key), str) or not environment[key]:
                errors.append(f"capture.environment.{key}: expected non-empty string")
        scale = environment.get("display_scale")
        if not isinstance(scale, (int, float)) or isinstance(scale, bool) or scale <= 0:
            errors.append("capture.environment.display_scale: expected positive number")
        if "rendering_flags" in environment:
            flags = environment.get("rendering_flags")
            if not isinstance(flags, list) or not flags or not all(
                isinstance(flag, str) and flag for flag in flags
            ):
                errors.append(
                    "capture.environment.rendering_flags: "
                    "expected non-empty string array"
                )

    fonts = obj.get("fonts")
    if not isinstance(fonts, list):
        errors.append("capture.fonts: expected array")
    else:
        for index, font in enumerate(fonts):
            font_obj = _require_keys(
                font,
                f"capture.fonts[{index}]",
                {"family", "style", "sha256"},
                set(),
                errors,
            )
            if font_obj is not None:
                _check_digest(
                    font_obj.get("sha256"),
                    f"capture.fonts[{index}].sha256",
                    errors,
                )

    capture_input = _require_keys(
        obj.get("input"),
        "capture.input",
        {"unit", "index", "pixel_size", "background"},
        {
            "viewport_width_px",
            "viewport_height_px",
            "device_scale_factor",
            "fit",
        },
        errors,
    )
    if capture_input is not None:
        if capture_input.get("unit") not in {"page", "slide", "view"}:
            errors.append("capture.input.unit: expected page/slide/view")
        for key in ("index", "pixel_size"):
            value = capture_input.get(key)
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                errors.append(f"capture.input.{key}: expected positive integer")
        if not isinstance(capture_input.get("background"), str):
            errors.append("capture.input.background: expected string")
        for key in ("viewport_width_px", "viewport_height_px"):
            if key in capture_input:
                value = capture_input.get(key)
                if (
                    not isinstance(value, int)
                    or isinstance(value, bool)
                    or value < 1
                    or value > 16384
                ):
                    errors.append(
                        f"capture.input.{key}: expected integer from 1 to 16384"
                    )
        if "device_scale_factor" in capture_input:
            scale = capture_input.get("device_scale_factor")
            if (
                not isinstance(scale, (int, float))
                or isinstance(scale, bool)
                or scale <= 0
                or scale > 8
            ):
                errors.append(
                    "capture.input.device_scale_factor: expected 0 < value <= 8"
                )
        if "fit" in capture_input and capture_input.get("fit") != "contain":
            errors.append("capture.input.fit: expected contain")
        if obj.get("renderer_class") == "browser" and status == "passed":
            if environment is not None and "rendering_flags" not in environment:
                errors.append(
                    "capture.environment.rendering_flags: "
                    "required for passing browser capture"
                )
            for key in (
                "viewport_width_px",
                "viewport_height_px",
                "device_scale_factor",
                "fit",
            ):
                if key not in capture_input:
                    errors.append(
                        f"capture.input.{key}: required for passing browser capture"
                    )

    command = _require_keys(
        obj.get("command"),
        "capture.command",
        {
            "argv",
            "timeout_seconds",
            "exit_code",
            "stdout_sha256",
            "stderr_sha256",
        },
        set(),
        errors,
    )
    if command is not None:
        argv = command.get("argv")
        if not isinstance(argv, list) or not argv or not all(
            isinstance(arg, str) for arg in argv
        ):
            errors.append("capture.command.argv: expected non-empty string array")
        timeout = command.get("timeout_seconds")
        if (
            not isinstance(timeout, (int, float))
            or isinstance(timeout, bool)
            or timeout <= 0
            or timeout > 600
        ):
            errors.append("capture.command.timeout_seconds: expected 0 < value <= 600")
        if command.get("exit_code") is not None and not isinstance(
            command.get("exit_code"), int
        ):
            errors.append("capture.command.exit_code: expected integer or null")
        _check_digest(
            command.get("stdout_sha256"), "capture.command.stdout_sha256", errors
        )
        _check_digest(
            command.get("stderr_sha256"), "capture.command.stderr_sha256", errors
        )

    output = _require_keys(
        obj.get("output"),
        "capture.output",
        {
            "path",
            "sha256",
            "media_type",
            "width_px",
            "height_px",
            "colorspace",
            "page_count",
            "page_sha256",
        },
        set(),
        errors,
    )
    if output is not None:
        if status == "passed":
            _check_relative_path(output.get("path"), "capture.output.path", errors)
            _check_digest(output.get("sha256"), "capture.output.sha256", errors)
            for key in ("width_px", "height_px", "page_count"):
                value = output.get(key)
                if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                    errors.append(f"capture.output.{key}: expected positive integer")
            for key in ("media_type", "colorspace"):
                if not isinstance(output.get(key), str) or not output[key]:
                    errors.append(f"capture.output.{key}: expected non-empty string")
            page_hashes = output.get("page_sha256")
            if not isinstance(page_hashes, list) or not page_hashes:
                errors.append("capture.output.page_sha256: expected non-empty array")
            else:
                for index, digest in enumerate(page_hashes):
                    _check_digest(
                        digest, f"capture.output.page_sha256[{index}]", errors
                    )
        else:
            if output.get("path") is not None or output.get("sha256") is not None:
                errors.append("capture.output: non-pass output path/hash must be null")
            if output.get("page_sha256") != []:
                errors.append("capture.output.page_sha256: non-pass must be empty")


def _validate_comparison(comparison: Any, errors: list[str]) -> None:
    obj = _require_keys(
        comparison,
        "comparison",
        {
            "status",
            "diagnostic",
            "baseline",
            "candidate",
            "implementation",
            "dimensions",
            "metrics",
            "thresholds",
            "crop_regions",
            "mask",
            "changed_bounds",
        },
        {"diff_image_path", "diff_image_sha256"},
        errors,
    )
    if obj is None:
        return
    status = obj.get("status")
    if status not in STATUSES:
        errors.append(
            "comparison.status: expected passed/failed/unavailable/manual-required"
        )
    if status == "passed" and obj.get("diagnostic") is not None:
        errors.append("comparison.diagnostic: pass must not have a diagnostic")
    if status != "passed" and not isinstance(obj.get("diagnostic"), str):
        errors.append("comparison.diagnostic: non-pass requires a diagnostic")

    for label in ("baseline", "candidate"):
        reference = _require_keys(
            obj.get(label),
            f"comparison.{label}",
            {"evidence_sha256", "image_path", "image_sha256"},
            set(),
            errors,
        )
        if reference is not None:
            _check_digest(
                reference.get("evidence_sha256"),
                f"comparison.{label}.evidence_sha256",
                errors,
            )
            _check_relative_path(
                reference.get("image_path"),
                f"comparison.{label}.image_path",
                errors,
            )
            _check_digest(
                reference.get("image_sha256"),
                f"comparison.{label}.image_sha256",
                errors,
            )

    implementation = _require_keys(
        obj.get("implementation"),
        "comparison.implementation",
        {"name", "version"},
        {"executable_path"},
        errors,
    )
    if implementation is not None:
        for key in ("name", "version"):
            if not isinstance(implementation.get(key), str) or not implementation[key]:
                errors.append(f"comparison.implementation.{key}: expected string")

    thresholds = _require_keys(
        obj.get("thresholds"),
        "comparison.thresholds",
        {
            "antialias_tolerance",
            "max_changed_fraction",
            "max_mean_absolute_error",
            "max_channel_delta",
            "max_masked_fraction",
        },
        set(),
        errors,
    )
    if thresholds is not None:
        for key in ("max_changed_fraction", "max_masked_fraction"):
            value = thresholds.get(key)
            if not isinstance(value, (int, float)) or not 0 <= value <= 1:
                errors.append(f"comparison.thresholds.{key}: expected 0..1")
        for key in (
            "antialias_tolerance",
            "max_mean_absolute_error",
            "max_channel_delta",
        ):
            value = thresholds.get(key)
            if not isinstance(value, (int, float)) or not 0 <= value <= 255:
                errors.append(f"comparison.thresholds.{key}: expected 0..255")

    dimensions = obj.get("dimensions")
    if dimensions is not None:
        dimension_obj = _require_keys(
            dimensions,
            "comparison.dimensions",
            {"width_px", "height_px", "colorspace"},
            set(),
            errors,
        )
        if dimension_obj is not None:
            for key in ("width_px", "height_px"):
                value = dimension_obj.get(key)
                if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                    errors.append(
                        f"comparison.dimensions.{key}: expected positive integer"
                    )
            if not isinstance(dimension_obj.get("colorspace"), str) or not (
                dimension_obj.get("colorspace")
            ):
                errors.append(
                    "comparison.dimensions.colorspace: expected non-empty string"
                )

    metrics = obj.get("metrics")
    if metrics is not None:
        metric_obj = _require_keys(
            metrics,
            "comparison.metrics",
            {
                "total_pixels",
                "compared_pixels",
                "masked_pixels",
                "changed_pixels",
                "changed_fraction",
                "mean_absolute_error",
                "max_channel_delta",
            },
            set(),
            errors,
        )
        if metric_obj is not None:
            for key in (
                "total_pixels",
                "compared_pixels",
                "masked_pixels",
                "changed_pixels",
                "max_channel_delta",
            ):
                value = metric_obj.get(key)
                if not isinstance(value, int) or isinstance(value, bool) or value < 0:
                    errors.append(
                        f"comparison.metrics.{key}: expected non-negative integer"
                    )
            total = metric_obj.get("total_pixels")
            if isinstance(total, int) and total < 1:
                errors.append("comparison.metrics.total_pixels: expected positive integer")
            for key, maximum in (
                ("changed_fraction", 1),
                ("mean_absolute_error", 255),
            ):
                value = metric_obj.get(key)
                if (
                    not isinstance(value, (int, float))
                    or isinstance(value, bool)
                    or not 0 <= value <= maximum
                ):
                    errors.append(
                        f"comparison.metrics.{key}: expected 0..{maximum}"
                    )
            if all(
                isinstance(metric_obj.get(key), int)
                for key in ("total_pixels", "compared_pixels", "masked_pixels")
            ) and (
                metric_obj["compared_pixels"] + metric_obj["masked_pixels"]
                != metric_obj["total_pixels"]
            ):
                errors.append(
                    "comparison.metrics: compared plus masked must equal total"
                )
            if (
                isinstance(metric_obj.get("changed_pixels"), int)
                and isinstance(metric_obj.get("compared_pixels"), int)
                and metric_obj["changed_pixels"] > metric_obj["compared_pixels"]
            ):
                errors.append(
                    "comparison.metrics.changed_pixels: exceeds compared pixels"
                )

    if status == "passed" and (dimensions is None or metrics is None):
        errors.append("comparison: pass requires dimensions and metrics")
    if status in {"unavailable", "manual-required"} and (
        dimensions is not None or metrics is not None
    ):
        errors.append(
            "comparison: unavailable/manual-required must not claim metrics"
        )

    crops = obj.get("crop_regions")
    if not isinstance(crops, list):
        errors.append("comparison.crop_regions: expected array")
    else:
        for index, crop in enumerate(crops):
            if (
                not isinstance(crop, list)
                or len(crop) != 4
                or not all(isinstance(value, int) for value in crop)
                or crop[0] < 0
                or crop[1] < 0
                or crop[2] < 1
                or crop[3] < 1
            ):
                errors.append(
                    f"comparison.crop_regions[{index}]: expected [x,y,width,height]"
                )

    mask = obj.get("mask")
    if mask is not None:
        mask_obj = _require_keys(
            mask,
            "comparison.mask",
            {"path", "sha256", "masked_fraction", "white_means"},
            set(),
            errors,
        )
        if mask_obj is not None:
            _check_relative_path(mask_obj.get("path"), "comparison.mask.path", errors)
            _check_digest(mask_obj.get("sha256"), "comparison.mask.sha256", errors)
            if mask_obj.get("white_means") != "ignored":
                errors.append("comparison.mask.white_means: expected ignored")
            masked_fraction = mask_obj.get("masked_fraction")
            if (
                not isinstance(masked_fraction, (int, float))
                or isinstance(masked_fraction, bool)
                or not 0 <= masked_fraction <= 1
            ):
                errors.append("comparison.mask.masked_fraction: expected 0..1")

    changed_bounds = obj.get("changed_bounds")
    if changed_bounds is not None and (
        not isinstance(changed_bounds, list)
        or len(changed_bounds) != 4
        or not all(isinstance(value, int) for value in changed_bounds)
        or changed_bounds[0] < 0
        or changed_bounds[1] < 0
        or changed_bounds[2] < 1
        or changed_bounds[3] < 1
    ):
        errors.append(
            "comparison.changed_bounds: expected null or [x,y,width,height]"
        )

    if ("diff_image_path" in obj) != ("diff_image_sha256" in obj):
        errors.append("comparison: diff image path and sha256 must appear together")
    elif "diff_image_path" in obj:
        _check_relative_path(
            obj.get("diff_image_path"), "comparison.diff_image_path", errors
        )
        _check_digest(
            obj.get("diff_image_sha256"),
            "comparison.diff_image_sha256",
            errors,
        )


def _validate_native_lifecycle(native: Any, errors: list[str]) -> None:
    obj = _require_keys(
        native,
        "native_lifecycle",
        {
            "renderer_class",
            "status",
            "application",
            "version",
            "method",
            "diagnostic",
        },
        {
            "open_without_repair",
            "editability_checked",
            "save_size",
            "save_sha256",
            "zip_valid",
            "reopen_passed",
        },
        errors,
    )
    if obj is None:
        return
    if obj.get("renderer_class") not in {"native-word", "native-powerpoint"}:
        errors.append("native_lifecycle.renderer_class: expected native Office class")
    status = obj.get("status")
    if status not in STATUSES:
        errors.append("native_lifecycle.status: invalid status")
    for key in ("application", "version"):
        if not isinstance(obj.get(key), str) or not obj[key]:
            errors.append(f"native_lifecycle.{key}: expected non-empty string")
    if obj.get("method") not in {"automation", "manual"}:
        errors.append("native_lifecycle.method: expected automation/manual")
    if status == "passed":
        if obj.get("diagnostic") is not None:
            errors.append("native_lifecycle.diagnostic: pass must be null")
        for key in (
            "open_without_repair",
            "editability_checked",
            "zip_valid",
            "reopen_passed",
        ):
            if obj.get(key) is not True:
                errors.append(f"native_lifecycle.{key}: native pass requires true")
        if not isinstance(obj.get("save_size"), int) or obj["save_size"] < 1:
            errors.append("native_lifecycle.save_size: native pass requires non-empty save")
        _check_digest(
            obj.get("save_sha256"), "native_lifecycle.save_sha256", errors
        )
    elif not isinstance(obj.get("diagnostic"), str) or not obj["diagnostic"]:
        errors.append("native_lifecycle.diagnostic: non-pass requires diagnostic")


def _validate_human_review(review: Any, errors: list[str]) -> None:
    obj = _require_keys(
        review,
        "human_review",
        {
            "evidence_sha256",
            "reviewer",
            "checkpoint",
            "crops",
            "decision",
            "rationale",
        },
        set(),
        errors,
    )
    if obj is None:
        return
    _check_digest(obj.get("evidence_sha256"), "human_review.evidence_sha256", errors)
    for key in ("reviewer", "checkpoint", "rationale"):
        if not isinstance(obj.get(key), str) or not obj[key]:
            errors.append(f"human_review.{key}: expected non-empty string")
    if obj.get("decision") not in {"accept", "reject", "manual"}:
        errors.append("human_review.decision: invalid decision")
    crops = obj.get("crops")
    if not isinstance(crops, list) or not all(isinstance(item, str) for item in crops):
        errors.append("human_review.crops: expected string array")


def validate_manifest_data(
    manifest: Any,
    root: Path = DEFAULT_ROOT,
    *,
    check_files: bool = True,
) -> list[str]:
    """Validate the bounded 0.1 envelope and optionally verify bound files."""

    errors: list[str] = []
    obj = _require_keys(
        manifest,
        "$",
        {"schema", "evidence_sha256", "subject", "capture"},
        {"comparison", "native_lifecycle", "human_review"},
        errors,
    )
    if obj is None:
        return errors
    if obj.get("schema") != SCHEMA_ID:
        errors.append(f"schema: expected {SCHEMA_ID}")
    _check_digest(obj.get("evidence_sha256"), "evidence_sha256", errors)

    subject = _require_keys(
        obj.get("subject"),
        "subject",
        {"lane", "checkpoint", "artifact_path", "artifact_sha256"},
        {"source_sha256"},
        errors,
    )
    if subject is not None:
        if subject.get("lane") not in {"markdown-docx", "pptv-pptx"}:
            errors.append("subject.lane: unsupported lane")
        if not isinstance(subject.get("checkpoint"), str) or not subject["checkpoint"]:
            errors.append("subject.checkpoint: expected non-empty string")
        _check_relative_path(
            subject.get("artifact_path"), "subject.artifact_path", errors
        )
        _check_digest(
            subject.get("artifact_sha256"), "subject.artifact_sha256", errors
        )
        if "source_sha256" in subject:
            _check_digest(
                subject.get("source_sha256"), "subject.source_sha256", errors
            )

    _validate_capture(obj.get("capture"), errors)
    if "comparison" in obj:
        _validate_comparison(obj.get("comparison"), errors)
    if "native_lifecycle" in obj:
        _validate_native_lifecycle(obj.get("native_lifecycle"), errors)
    if "human_review" in obj:
        _validate_human_review(obj.get("human_review"), errors)

    expected_evidence_hash = evidence_sha256(obj)
    if obj.get("evidence_sha256") != expected_evidence_hash:
        errors.append("evidence_sha256: does not bind canonical manifest payload")

    errors.extend(_privacy_errors(obj))

    if check_files:
        bindings: list[tuple[str, str, str]] = []
        if subject and _is_relative_path(subject.get("artifact_path")) and _is_digest(
            subject.get("artifact_sha256")
        ):
            bindings.append(
                (
                    "subject.artifact",
                    subject["artifact_path"],
                    subject["artifact_sha256"],
                )
            )
        capture = obj.get("capture")
        if isinstance(capture, dict) and capture.get("status") == "passed":
            output = capture.get("output")
            if (
                isinstance(output, dict)
                and _is_relative_path(output.get("path"))
                and _is_digest(output.get("sha256"))
            ):
                bindings.append(
                    ("capture.output", output["path"], output["sha256"])
                )
        comparison = obj.get("comparison")
        if isinstance(comparison, dict):
            for label in ("baseline", "candidate"):
                ref = comparison.get(label)
                if (
                    isinstance(ref, dict)
                    and _is_relative_path(ref.get("image_path"))
                    and _is_digest(ref.get("image_sha256"))
                ):
                    bindings.append(
                        (
                            f"comparison.{label}",
                            ref["image_path"],
                            ref["image_sha256"],
                        )
                    )
            mask = comparison.get("mask")
            if (
                isinstance(mask, dict)
                and _is_relative_path(mask.get("path"))
                and _is_digest(mask.get("sha256"))
            ):
                bindings.append(("comparison.mask", mask["path"], mask["sha256"]))
        for label, relative, expected in bindings:
            try:
                path = _resolve_relative(root, relative)
            except VisualEvidenceError as exc:
                errors.append(f"{label}: {exc}")
                continue
            if not path.is_file():
                errors.append(f"{label}: bound file is missing")
            elif sha256_file(path) != expected:
                errors.append(f"{label}: sha256 mismatch")
    return errors


def load_manifest(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"cannot read manifest {path}: {exc}",
        ) from exc
    if not isinstance(value, dict):
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID", "manifest root must be an object"
        )
    return value


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    """Write a new evidence manifest atomically; never overwrite."""

    if path.exists():
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"refusing to overwrite evidence manifest: {path}",
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(
        manifest, ensure_ascii=False, allow_nan=False, indent=2, sort_keys=True
    ).encode("utf-8") + b"\n"
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", suffix=".tmp", dir=path.parent
    )
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _environment_identity() -> dict[str, Any]:
    os_name = platform.system() or "unknown"
    os_version = (
        platform.mac_ver()[0] if os_name == "Darwin" else platform.release()
    ) or "unknown"
    try:
        locale_name = locale.setlocale(locale.LC_ALL, None) or "unknown"
    except locale.Error:
        locale_name = "unknown"
    return {
        "os": os_name,
        "os_version": os_version,
        "architecture": platform.machine() or "unknown",
        "locale": locale_name,
        "display_scale": 1.0,
    }


def _empty_output() -> dict[str, Any]:
    return {
        "path": None,
        "sha256": None,
        "media_type": None,
        "width_px": None,
        "height_px": None,
        "colorspace": None,
        "page_count": None,
        "page_sha256": [],
    }


def _read_png_header(path: Path) -> tuple[int, int, str]:
    data = path.read_bytes()[:33]
    if len(data) < 33 or data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"capture output is not a PNG: {path}",
        )
    width, height, bit_depth, color_type = struct.unpack(">IIBB", data[16:26])
    colors = {
        0: "gray",
        2: "rgb",
        3: "indexed",
        4: "gray-alpha",
        6: "rgba",
    }
    if width < 1 or height < 1 or color_type not in colors:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "capture PNG has invalid dimensions or color type",
        )
    return width, height, f"png-{colors[color_type]}-{bit_depth}"


def _quicklook_generator_identity(
    inventory: bytes, suffix: str
) -> tuple[str, str, str] | None:
    uti = {
        ".docx": "org.openxmlformats.wordprocessingml.document",
        ".pptx": "org.openxmlformats.presentationml.presentation",
    }[suffix]
    matches: list[tuple[str, str, str]] = []
    for raw_line in inventory.decode("utf-8", "replace").splitlines():
        line = raw_line.strip()
        if not line.startswith(f"{uti} -> "):
            continue
        match = re.fullmatch(r".+ -> (.+) \(([^()]+)\)", line)
        if match:
            matches.append((match.group(1), match.group(2), sha256_bytes(line.encode())))
    return matches[0] if len(matches) == 1 else None


def _quicklook_base(
    artifact: Path,
    root: Path,
    lane: str,
    checkpoint: str,
    pixel_size: int,
    timeout_seconds: float,
    binary: str,
    version: str,
) -> dict[str, Any]:
    unit = "page" if artifact.suffix.lower() == ".docx" else "slide"
    artifact_hash = sha256_file(artifact)
    isolated_name = (
        f"input-{artifact_hash[:16]}{artifact.suffix.lower()}"
    )
    return {
        "schema": SCHEMA_ID,
        "subject": {
            "lane": lane,
            "checkpoint": checkpoint,
            "artifact_path": _relative_path(root, artifact),
            "artifact_sha256": artifact_hash,
        },
        "capture": {
            "renderer_class": "quick-look",
            "status": "unavailable",
            "diagnostic": "OFFICE-VISUAL-UNAVAILABLE: capture not attempted",
            "renderer": {
                "product": "macOS Quick Look",
                "version": version,
                "executable_path": binary,
            },
            "environment": _environment_identity(),
            "fonts": [],
            "input": {
                "unit": unit,
                "index": 1,
                "pixel_size": pixel_size,
                "background": "renderer-default",
            },
            "command": {
                "argv": [
                    binary,
                    "-t",
                    "-s",
                    str(pixel_size),
                    "-o",
                    "$TEMP",
                    f"$TEMP/{isolated_name}",
                ],
                "timeout_seconds": timeout_seconds,
                "exit_code": None,
                "stdout_sha256": EMPTY_SHA256,
                "stderr_sha256": EMPTY_SHA256,
            },
            "output": _empty_output(),
        },
    }


def capture_quicklook(
    artifact: Path,
    output: Path,
    *,
    root: Path,
    lane: str,
    checkpoint: str,
    trusted: bool,
    pixel_size: int = 1600,
    timeout_seconds: float = 30.0,
) -> dict[str, Any]:
    """Capture one trusted DOCX/PPTX Quick Look preview or explicit unavailable."""

    root = root.resolve()
    artifact = artifact.resolve()
    output = output.resolve()
    if not trusted:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-UNSAFE-INPUT",
            "Quick Look direct-open requires an explicit trusted-artifact assertion",
        )
    _relative_path(root, artifact)
    _relative_path(root, output)
    if artifact.suffix.lower() not in {".docx", ".pptx"}:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "Quick Look slice accepts only trusted .docx or .pptx artifacts",
        )
    if not artifact.is_file():
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID", f"artifact not found: {artifact}"
        )
    if output.exists():
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"refusing to overwrite capture output: {output}",
        )
    if pixel_size < 1 or pixel_size > 16384 or not 0 < timeout_seconds <= 600:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "pixel size or timeout is outside the bounded capture profile",
        )

    qlmanage = shutil.which("qlmanage")
    mac_version = platform.mac_ver()[0] or platform.release() or "unknown"
    binary_label = qlmanage or "qlmanage-unavailable"
    evidence = _quicklook_base(
        artifact,
        root,
        lane,
        checkpoint,
        pixel_size,
        timeout_seconds,
        binary_label,
        f"macOS {mac_version}",
    )
    capture = evidence["capture"]
    if sys.platform != "darwin" or not qlmanage:
        capture["diagnostic"] = (
            "OFFICE-VISUAL-UNAVAILABLE: macOS qlmanage is not available"
        )
        return finalize_evidence(evidence)

    environment = os.environ.copy()
    environment["LC_ALL"] = "C"
    environment["LANG"] = "C"
    try:
        inventory = subprocess.run(
            [qlmanage, "-m", "plugins"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=min(timeout_seconds, 10.0),
            env=environment,
        )
    except (OSError, subprocess.TimeoutExpired):
        inventory = None
    generator = (
        _quicklook_generator_identity(inventory.stdout, artifact.suffix.lower())
        if inventory is not None and inventory.returncode == 0
        else None
    )
    if generator is None:
        capture["status"] = "unavailable"
        capture["diagnostic"] = (
            "OFFICE-VISUAL-UNAVAILABLE: the matching Quick Look Office "
            "generator identity is unavailable or ambiguous"
        )
        return finalize_evidence(evidence)
    generator_path, generator_version, generator_hash = generator
    capture["renderer"] = {
        "product": "macOS Quick Look Office generator",
        "version": generator_version,
        "executable_path": generator_path,
        "identity_sha256": generator_hash,
    }

    with tempfile.TemporaryDirectory(prefix="office180-quicklook-") as temp_name:
        temp_dir = Path(temp_name)
        isolated_input = (
            temp_dir
            / (
                "input-"
                + evidence["subject"]["artifact_sha256"][:16]
                + artifact.suffix.lower()
            )
        )
        try:
            shutil.copyfile(artifact, isolated_input)
        except OSError as exc:
            capture["status"] = "failed"
            capture["diagnostic"] = (
                "OFFICE-VISUAL-EVIDENCE-INVALID: cannot create the "
                f"cache-isolated capture input ({type(exc).__name__})"
            )
            return finalize_evidence(evidence)
        if sha256_file(isolated_input) != evidence["subject"]["artifact_sha256"]:
            capture["status"] = "failed"
            capture["diagnostic"] = (
                "OFFICE-VISUAL-EVIDENCE-INVALID: cache-isolated capture "
                "input does not match the bound artifact"
            )
            return finalize_evidence(evidence)
        command = [
            qlmanage,
            "-t",
            "-s",
            str(pixel_size),
            "-o",
            str(temp_dir),
            str(isolated_input),
        ]
        try:
            result = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=timeout_seconds,
                env=environment,
            )
        except subprocess.TimeoutExpired as exc:
            capture["status"] = "unavailable"
            capture["diagnostic"] = (
                f"OFFICE-VISUAL-TIMEOUT: qlmanage exceeded {timeout_seconds:g}s"
            )
            capture["command"]["stdout_sha256"] = sha256_bytes(exc.stdout or b"")
            capture["command"]["stderr_sha256"] = sha256_bytes(exc.stderr or b"")
            return finalize_evidence(evidence)
        except OSError as exc:
            capture["status"] = "unavailable"
            capture["diagnostic"] = f"OFFICE-VISUAL-UNAVAILABLE: {exc}"
            return finalize_evidence(evidence)

        capture["command"]["exit_code"] = result.returncode
        capture["command"]["stdout_sha256"] = sha256_bytes(result.stdout)
        capture["command"]["stderr_sha256"] = sha256_bytes(result.stderr)
        if result.returncode != 0:
            capture["status"] = "failed"
            capture["diagnostic"] = (
                f"OFFICE-VISUAL-UNAVAILABLE: qlmanage exited {result.returncode}"
            )
            return finalize_evidence(evidence)

        candidates = sorted(
            path
            for path in temp_dir.rglob("*")
            if path.is_file() and path.suffix.lower() == ".png"
        )
        if len(candidates) != 1 or candidates[0].stat().st_size == 0:
            capture["status"] = "failed"
            capture["diagnostic"] = (
                "OFFICE-VISUAL-EMPTY: qlmanage did not produce one non-empty PNG"
            )
            return finalize_evidence(evidence)

        output.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary_name = tempfile.mkstemp(
            prefix=f".{output.name}.", suffix=".tmp", dir=output.parent
        )
        os.close(fd)
        temporary_output = Path(temporary_name)
        try:
            shutil.copyfile(candidates[0], temporary_output)
            os.replace(temporary_output, output)
        finally:
            if temporary_output.exists():
                temporary_output.unlink()

    width, height, colorspace = _read_png_header(output)
    image_hash = sha256_file(output)
    capture["status"] = "passed"
    capture["diagnostic"] = None
    capture["output"] = {
        "path": _relative_path(root, output),
        "sha256": image_hash,
        "media_type": "image/png",
        "width_px": width,
        "height_px": height,
        "colorspace": colorspace,
        "page_count": 1,
        "page_sha256": [image_hash],
    }
    return finalize_evidence(evidence)


def _redact_executable_path(value: str, root: Path) -> str:
    """Return an exact-but-private path label suitable for checked evidence."""

    try:
        resolved = Path(value).resolve()
    except (OSError, RuntimeError):
        return value
    for base, label in ((root.resolve(), "$ROOT"), (Path.home().resolve(), "$HOME")):
        try:
            relative = resolved.relative_to(base)
        except ValueError:
            continue
        return label if str(relative) == "." else f"{label}/{relative.as_posix()}"
    return str(resolved)


def _browser_capture_base(
    artifact: Path,
    root: Path,
    checkpoint: str,
    artifact_hash: str,
    *,
    node_label: str,
    width_px: int,
    height_px: int,
    background: str,
    timeout_seconds: float,
) -> dict[str, Any]:
    environment = _environment_identity()
    environment["locale"] = "en-US"
    environment["display_scale"] = 1.0
    environment["rendering_flags"] = list(BROWSER_RENDERING_FLAGS)
    return {
        "schema": SCHEMA_ID,
        "subject": {
            "lane": "pptv-pptx",
            "checkpoint": checkpoint,
            "artifact_path": _relative_path(root, artifact),
            "artifact_sha256": artifact_hash,
        },
        "capture": {
            "renderer_class": "browser",
            "status": "unavailable",
            "diagnostic": "OFFICE-VISUAL-UNAVAILABLE: capture not attempted",
            "renderer": {
                "product": "Playwright Chromium",
                "version": "unavailable",
                "executable_path": "chromium-unavailable",
            },
            "environment": environment,
            "fonts": [],
            "input": {
                "unit": "view",
                "index": 1,
                "pixel_size": max(width_px, height_px),
                "background": background,
                "viewport_width_px": width_px,
                "viewport_height_px": height_px,
                "device_scale_factor": 1.0,
                "fit": "contain",
            },
            "command": {
                "argv": [
                    node_label,
                    "$TOOL/capture-browser-svg.mjs",
                    "--artifact",
                    f"$ROOT/{_relative_path(root, artifact)}",
                    "--artifact-sha256",
                    artifact_hash,
                    "--output",
                    "$TEMP/capture.png",
                    "--width",
                    str(width_px),
                    "--height",
                    str(height_px),
                    "--background",
                    background,
                    "--timeout-ms",
                    str(max(1, int(timeout_seconds * 1000))),
                ],
                "timeout_seconds": timeout_seconds,
                "exit_code": None,
                "stdout_sha256": EMPTY_SHA256,
                "stderr_sha256": EMPTY_SHA256,
            },
            "output": _empty_output(),
        },
    }


def _browser_failure(
    evidence: dict[str, Any],
    code: str,
    message: str,
) -> dict[str, Any]:
    capture = evidence["capture"]
    capture["status"] = (
        "unavailable"
        if code in {"OFFICE-VISUAL-UNAVAILABLE", "OFFICE-VISUAL-TIMEOUT"}
        else "failed"
    )
    capture["diagnostic"] = f"{code}: {message}"
    capture["output"] = _empty_output()
    return finalize_evidence(evidence)


def capture_browser_svg(
    artifact: Path,
    output: Path,
    *,
    root: Path,
    checkpoint: str,
    trusted: bool,
    width_px: int = 1600,
    height_px: int = 900,
    background: str = "#ffffff",
    timeout_seconds: float = 30.0,
) -> dict[str, Any]:
    """Capture one trusted, validated standalone PPTV SVG through Chromium."""

    root = root.resolve()
    artifact = artifact.resolve()
    output = output.resolve()
    if not trusted:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-UNSAFE-INPUT",
            "browser direct-open requires an explicit trusted-artifact assertion",
        )
    _relative_path(root, artifact)
    _relative_path(root, output)
    if not artifact.name.endswith(".pptv.svg"):
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "browser SVG capture accepts only standalone .pptv.svg artifacts",
        )
    if not artifact.is_file():
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID", f"artifact not found: {artifact}"
        )
    if output.suffix.lower() != ".png":
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "browser SVG capture output must use the .png suffix",
        )
    if output.exists():
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"refusing to overwrite capture output: {output}",
        )
    if not isinstance(checkpoint, str) or not checkpoint:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "browser capture checkpoint must be a non-empty string",
        )
    if (
        not isinstance(width_px, int)
        or isinstance(width_px, bool)
        or not isinstance(height_px, int)
        or isinstance(height_px, bool)
        or width_px < 1
        or height_px < 1
        or width_px > BROWSER_MAX_DIMENSION
        or height_px > BROWSER_MAX_DIMENSION
        or width_px * height_px > BROWSER_MAX_PIXELS
        or not isinstance(timeout_seconds, (int, float))
        or isinstance(timeout_seconds, bool)
        or not 1 <= timeout_seconds <= 600
        or not isinstance(background, str)
        or not OPAQUE_HEX_COLOR_RE.fullmatch(background)
    ):
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "dimensions, opaque background, or timeout are outside the "
            "bounded browser capture profile",
        )
    background = background.lower()
    artifact_hash = sha256_file(artifact)
    node = shutil.which("node")
    pnpm = shutil.which("pnpm")
    node_label = (
        _redact_executable_path(node, root) if node else "node-unavailable"
    )
    evidence = _browser_capture_base(
        artifact,
        root,
        checkpoint,
        artifact_hash,
        node_label=node_label,
        width_px=width_px,
        height_px=height_px,
        background=background,
        timeout_seconds=timeout_seconds,
    )
    capture = evidence["capture"]
    if not pnpm:
        return _browser_failure(
            evidence,
            "OFFICE-VISUAL-UNAVAILABLE",
            "the pinned PPTV validator command is unavailable",
        )
    if not node or not BROWSER_CAPTURE_HELPER.is_file():
        return _browser_failure(
            evidence,
            "OFFICE-VISUAL-UNAVAILABLE",
            "Node or the checked browser capture helper is unavailable",
        )

    environment = os.environ.copy()
    environment["LC_ALL"] = "C"
    environment["LANG"] = "C"
    environment["TZ"] = "UTC"
    environment["NO_PROXY"] = "127.0.0.1,localhost"
    environment["no_proxy"] = "127.0.0.1,localhost"
    for key in (
        "ALL_PROXY",
        "HTTPS_PROXY",
        "HTTP_PROXY",
        "all_proxy",
        "https_proxy",
        "http_proxy",
    ):
        environment.pop(key, None)

    validation_timeout = min(10.0, timeout_seconds / 3)
    browser_timeout = timeout_seconds - validation_timeout
    validation_command = [
        pnpm,
        "--silent",
        "pptv",
        "validate",
        str(artifact),
        "--format",
        "json",
    ]
    try:
        validation = subprocess.run(
            validation_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=validation_timeout,
            env=environment,
            cwd=DEFAULT_ROOT,
        )
    except subprocess.TimeoutExpired:
        return _browser_failure(
            evidence,
            "OFFICE-VISUAL-TIMEOUT",
            "PPTV validation exceeded its bounded preflight timeout",
        )
    except OSError:
        return _browser_failure(
            evidence,
            "OFFICE-VISUAL-UNAVAILABLE",
            "the pinned PPTV validator could not execute",
        )
    if validation.returncode != 0:
        return _browser_failure(
            evidence,
            "OFFICE-VISUAL-UNSAFE-INPUT",
            "artifact did not pass standalone PPTV validation",
        )
    try:
        validation_result = json.loads(validation.stdout)
    except (UnicodeError, json.JSONDecodeError):
        validation_result = None
    if (
        not isinstance(validation_result, dict)
        or validation_result.get("schema") != "pptv-diagram-validation/0.1"
        or validation_result.get("valid") is not True
        or validation_result.get("sourceSha256") != artifact_hash
    ):
        return _browser_failure(
            evidence,
            "OFFICE-VISUAL-UNSAFE-INPUT",
            "PPTV validation did not bind the exact standalone SVG bytes",
        )

    helper_timeout_ms = max(1, int(browser_timeout * 1000) - 500)
    capture["command"]["timeout_seconds"] = browser_timeout
    capture["command"]["argv"][-1] = str(helper_timeout_ms)

    with tempfile.TemporaryDirectory(prefix="office180-browser-svg-") as temp_name:
        temporary_capture = Path(temp_name) / "capture.png"
        helper_command = [
            node,
            str(BROWSER_CAPTURE_HELPER),
            "--artifact",
            str(artifact),
            "--artifact-sha256",
            artifact_hash,
            "--output",
            str(temporary_capture),
            "--width",
            str(width_px),
            "--height",
            str(height_px),
            "--background",
            background,
            "--timeout-ms",
            str(helper_timeout_ms),
        ]
        try:
            result = subprocess.run(
                helper_command,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=browser_timeout,
                env=environment,
                cwd=DEFAULT_ROOT,
            )
        except subprocess.TimeoutExpired as exc:
            capture["command"]["stdout_sha256"] = sha256_bytes(exc.stdout or b"")
            capture["command"]["stderr_sha256"] = sha256_bytes(exc.stderr or b"")
            return _browser_failure(
                evidence,
                "OFFICE-VISUAL-TIMEOUT",
                "Playwright Chromium exceeded the bounded capture timeout",
            )
        except OSError:
            return _browser_failure(
                evidence,
                "OFFICE-VISUAL-UNAVAILABLE",
                "the browser capture helper could not execute",
            )

        capture["command"]["exit_code"] = result.returncode
        capture["command"]["stdout_sha256"] = sha256_bytes(result.stdout)
        capture["command"]["stderr_sha256"] = sha256_bytes(result.stderr)
        try:
            helper_result = json.loads(result.stdout)
        except (UnicodeError, json.JSONDecodeError):
            helper_result = None
        if not isinstance(helper_result, dict):
            return _browser_failure(
                evidence,
                "OFFICE-VISUAL-EVIDENCE-INVALID",
                "browser capture helper returned malformed evidence",
            )
        if helper_result.get("ok") is not True or result.returncode != 0:
            code = helper_result.get("code")
            message = helper_result.get("message")
            if not isinstance(code, str) or not code.startswith("OFFICE-VISUAL-"):
                code = "OFFICE-VISUAL-EVIDENCE-INVALID"
            if not isinstance(message, str) or not message:
                message = "browser capture helper failed closed"
            return _browser_failure(evidence, code, message)

        renderer = helper_result.get("renderer")
        profile = helper_result.get("profile")
        if (
            not isinstance(renderer, dict)
            or renderer.get("product") != "Playwright Chromium"
            or not isinstance(renderer.get("playwrightVersion"), str)
            or not renderer["playwrightVersion"]
            or not isinstance(renderer.get("chromiumVersion"), str)
            or not renderer["chromiumVersion"]
            or not isinstance(renderer.get("executablePath"), str)
            or not renderer["executablePath"]
            or not isinstance(profile, dict)
            or profile.get("widthPx") != width_px
            or profile.get("heightPx") != height_px
            or profile.get("deviceScaleFactor") != 1
            or profile.get("background") != background
            or profile.get("fit") != "contain"
            or profile.get("locale") != "en-US"
            or profile.get("timezone") != "UTC"
            or profile.get("javaScriptEnabled") is not False
            or profile.get("loopbackOrigin") != "http://127.0.0.1:<ephemeral>"
            or profile.get("renderingFlags") != list(BROWSER_RENDERING_FLAGS)
        ):
            return _browser_failure(
                evidence,
                "OFFICE-VISUAL-EVIDENCE-INVALID",
                "browser capture helper profile did not match the fixed request",
            )
        if not temporary_capture.is_file() or temporary_capture.stat().st_size == 0:
            return _browser_failure(
                evidence,
                "OFFICE-VISUAL-EMPTY",
                "browser did not produce one non-empty PNG",
            )
        try:
            captured_width, captured_height, colorspace = _read_png_header(
                temporary_capture
            )
        except (OSError, VisualEvidenceError):
            return _browser_failure(
                evidence,
                "OFFICE-VISUAL-EVIDENCE-INVALID",
                "browser output is not a valid PNG",
            )
        if captured_width != width_px or captured_height != height_px:
            return _browser_failure(
                evidence,
                "OFFICE-VISUAL-DIMENSIONS",
                "browser output dimensions differ from the fixed viewport",
            )

        output.parent.mkdir(parents=True, exist_ok=True)
        _relative_path(root, output)
        fd, temporary_name = tempfile.mkstemp(
            prefix=f".{output.name}.", suffix=".tmp", dir=output.parent
        )
        os.close(fd)
        temporary_output = Path(temporary_name)
        try:
            shutil.copyfile(temporary_capture, temporary_output)
            try:
                os.link(temporary_output, output)
            except FileExistsError as exc:
                raise VisualEvidenceError(
                    "OFFICE-VISUAL-EVIDENCE-INVALID",
                    f"refusing to overwrite capture output: {output}",
                ) from exc
        finally:
            if temporary_output.exists():
                temporary_output.unlink()

    image_hash = sha256_file(output)
    executable_path = _redact_executable_path(renderer["executablePath"], root)
    renderer_version = (
        f"Playwright {renderer['playwrightVersion']}; "
        f"Chromium {renderer['chromiumVersion']}"
    )
    renderer_identity = {
        "product": "Playwright Chromium",
        "version": renderer_version,
        "executable_path": executable_path,
        "helper_sha256": sha256_file(BROWSER_CAPTURE_HELPER),
        "rendering_flags": list(BROWSER_RENDERING_FLAGS),
    }
    capture["renderer"] = {
        "product": "Playwright Chromium",
        "version": renderer_version,
        "executable_path": executable_path,
        "identity_sha256": sha256_bytes(canonical_json_bytes(renderer_identity)),
    }
    capture["status"] = "passed"
    capture["diagnostic"] = None
    capture["output"] = {
        "path": _relative_path(root, output),
        "sha256": image_hash,
        "media_type": "image/png",
        "width_px": width_px,
        "height_px": height_px,
        "colorspace": colorspace,
        "page_count": 1,
        "page_sha256": [image_hash],
    }
    return finalize_evidence(evidence)


def record_status(
    artifact: Path,
    *,
    root: Path,
    lane: str,
    checkpoint: str,
    renderer_class: str,
    status: str,
    diagnostic: str,
    product: str,
    version: str,
    executable_path: str,
) -> dict[str, Any]:
    """Record an unavailable or manual gate without fabricating a capture."""

    if renderer_class not in RENDERER_CLASSES or status not in {
        "unavailable",
        "manual-required",
    }:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "record-status accepts a known renderer and "
            "unavailable/manual-required only",
        )
    artifact = artifact.resolve()
    root = root.resolve()
    _relative_path(root, artifact)
    if not artifact.is_file():
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID", f"artifact not found: {artifact}"
        )
    evidence: dict[str, Any] = {
        "schema": SCHEMA_ID,
        "subject": {
            "lane": lane,
            "checkpoint": checkpoint,
            "artifact_path": _relative_path(root, artifact),
            "artifact_sha256": sha256_file(artifact),
        },
        "capture": {
            "renderer_class": renderer_class,
            "status": status,
            "diagnostic": diagnostic,
            "renderer": {
                "product": product,
                "version": version,
                "executable_path": executable_path,
            },
            "environment": _environment_identity(),
            "fonts": [],
            "input": {
                "unit": "page" if artifact.suffix.lower() == ".docx" else "slide",
                "index": 1,
                "pixel_size": 1,
                "background": "not-captured",
            },
            "command": {
                "argv": ["manual-status-record"],
                "timeout_seconds": 1,
                "exit_code": None,
                "stdout_sha256": EMPTY_SHA256,
                "stderr_sha256": EMPTY_SHA256,
            },
            "output": _empty_output(),
        },
    }
    if renderer_class in {"native-word", "native-powerpoint"}:
        evidence["native_lifecycle"] = {
            "renderer_class": renderer_class,
            "status": status,
            "application": product,
            "version": version,
            "method": "manual",
            "diagnostic": diagnostic,
        }
    return finalize_evidence(evidence)


@dataclass(frozen=True)
class Raster:
    width: int
    height: int
    rgba: bytes
    colorspace: str


def _load_ascii_pnm(path: Path) -> Raster | None:
    raw = path.read_bytes()
    if not (raw.startswith(b"P2") or raw.startswith(b"P3")):
        return None
    tokens = re.sub(rb"#[^\r\n]*(?:\r?\n|$)", b" ", raw).split()
    if len(tokens) < 4:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID", f"invalid Netpbm image: {path}"
        )
    magic = tokens[0]
    try:
        width, height, maximum = map(int, tokens[1:4])
        samples = [int(token) for token in tokens[4:]]
    except ValueError as exc:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID", f"invalid Netpbm number: {path}"
        ) from exc
    channels = 1 if magic == b"P2" else 3
    if (
        width < 1
        or height < 1
        or maximum < 1
        or maximum > 255
        or len(samples) != width * height * channels
        or any(sample < 0 or sample > maximum for sample in samples)
    ):
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID", f"invalid Netpbm raster: {path}"
        )
    rgba = bytearray()
    scale = 255 / maximum
    for index in range(0, len(samples), channels):
        if channels == 1:
            red = green = blue = round(samples[index] * scale)
        else:
            red, green, blue = (
                round(samples[index + offset] * scale) for offset in range(3)
            )
        rgba.extend((red, green, blue, 255))
    return Raster(width, height, bytes(rgba), "sRGB RGBA8")


def _imagemagick_identity() -> tuple[str, str]:
    binary = shutil.which("magick")
    if not binary:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-UNAVAILABLE",
            "ImageMagick `magick` is unavailable for non-Netpbm comparison",
        )
    try:
        result = subprocess.run(
            [binary, "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise VisualEvidenceError("OFFICE-VISUAL-UNAVAILABLE", str(exc)) from exc
    if result.returncode != 0:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-UNAVAILABLE",
            f"ImageMagick version command exited {result.returncode}",
        )
    version = (result.stdout.decode("utf-8", "replace").splitlines() or ["unknown"])[
        0
    ]
    return binary, version


def _load_with_imagemagick(path: Path, binary: str) -> Raster:
    identify = subprocess.run(
        [
            binary,
            "identify",
            "-format",
            "%w %h %[colorspace]",
            str(path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    if identify.returncode != 0:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"ImageMagick cannot identify {path}",
        )
    try:
        width_text, height_text, _ = identify.stdout.decode(
            "utf-8", "strict"
        ).split(maxsplit=2)
        width, height = int(width_text), int(height_text)
    except (UnicodeError, ValueError) as exc:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"invalid ImageMagick identity for {path}",
        ) from exc
    converted = subprocess.run(
        [
            binary,
            str(path),
            "-alpha",
            "on",
            "-colorspace",
            "sRGB",
            "-depth",
            "8",
            "rgba:-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
    if converted.returncode != 0 or len(converted.stdout) != width * height * 4:
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            f"ImageMagick cannot normalize {path} to RGBA8",
        )
    return Raster(width, height, converted.stdout, "sRGB RGBA8")


def _load_rasters(paths: list[Path]) -> tuple[list[Raster], dict[str, str]]:
    netpbm = [_load_ascii_pnm(path) for path in paths]
    if all(raster is not None for raster in netpbm):
        return (
            [raster for raster in netpbm if raster is not None],
            {"name": "office180-netpbm-rgba", "version": "0.1"},
        )
    binary, version = _imagemagick_identity()
    return (
        [_load_with_imagemagick(path, binary) for path in paths],
        {
            "name": "ImageMagick RGBA normalization",
            "version": version,
            "executable_path": binary,
        },
    )


def _image_reference(manifest: dict[str, Any]) -> tuple[str, str]:
    capture = manifest.get("capture")
    output = capture.get("output") if isinstance(capture, dict) else None
    if (
        not isinstance(capture, dict)
        or capture.get("status") != "passed"
        or not isinstance(output, dict)
        or not _is_relative_path(output.get("path"))
        or not _is_digest(output.get("sha256"))
    ):
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "comparison input must be a passing capture with a bound image",
        )
    return output["path"], output["sha256"]


def _comparison_shell(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
    baseline_path: str,
    baseline_hash: str,
    candidate_path: str,
    candidate_hash: str,
    thresholds: dict[str, Any],
) -> dict[str, Any]:
    return {
        "status": "unavailable",
        "diagnostic": "OFFICE-VISUAL-UNAVAILABLE: comparison not attempted",
        "baseline": {
            "evidence_sha256": baseline["evidence_sha256"],
            "image_path": baseline_path,
            "image_sha256": baseline_hash,
        },
        "candidate": {
            "evidence_sha256": candidate["evidence_sha256"],
            "image_path": candidate_path,
            "image_sha256": candidate_hash,
        },
        "implementation": {
            "name": "unavailable",
            "version": "unavailable",
        },
        "dimensions": None,
        "metrics": None,
        "thresholds": thresholds,
        "crop_regions": [],
        "mask": None,
        "changed_bounds": None,
    }


def compare_evidence(
    baseline: dict[str, Any],
    candidate: dict[str, Any],
    *,
    root: Path,
    mask_path: str | None = None,
    antialias_tolerance: int = 0,
    max_changed_fraction: float = 0.0,
    max_mean_absolute_error: float = 0.0,
    max_channel_delta: int = 0,
    max_masked_fraction: float = 0.0,
) -> dict[str, Any]:
    """Compare two passing capture manifests and return candidate-bound evidence."""

    root = root.resolve()
    for name, manifest in (("baseline", baseline), ("candidate", candidate)):
        errors = validate_manifest_data(manifest, root, check_files=True)
        if errors:
            raise VisualEvidenceError(
                "OFFICE-VISUAL-EVIDENCE-INVALID",
                f"{name} manifest: {'; '.join(errors)}",
            )
    if not (
        0 <= antialias_tolerance <= 255
        and 0 <= max_changed_fraction <= 1
        and 0 <= max_mean_absolute_error <= 255
        and 0 <= max_channel_delta <= 255
        and 0 <= max_masked_fraction <= 1
    ):
        raise VisualEvidenceError(
            "OFFICE-VISUAL-EVIDENCE-INVALID",
            "comparison thresholds are outside their bounded ranges",
        )

    baseline_rel, baseline_hash = _image_reference(baseline)
    candidate_rel, candidate_hash = _image_reference(candidate)
    baseline_file = _resolve_relative(root, baseline_rel)
    candidate_file = _resolve_relative(root, candidate_rel)
    thresholds = {
        "antialias_tolerance": antialias_tolerance,
        "max_changed_fraction": max_changed_fraction,
        "max_mean_absolute_error": max_mean_absolute_error,
        "max_channel_delta": max_channel_delta,
        "max_masked_fraction": max_masked_fraction,
    }
    comparison = _comparison_shell(
        baseline,
        candidate,
        baseline_rel,
        baseline_hash,
        candidate_rel,
        candidate_hash,
        thresholds,
    )
    result = copy.deepcopy(candidate)
    result.pop("evidence_sha256", None)
    result.pop("comparison", None)
    result["comparison"] = comparison

    paths = [baseline_file, candidate_file]
    resolved_mask: Path | None = None
    if mask_path is not None:
        resolved_mask = _resolve_relative(root, mask_path)
        paths.append(resolved_mask)
    try:
        rasters, implementation = _load_rasters(paths)
    except VisualEvidenceError as exc:
        comparison["status"] = (
            "unavailable"
            if exc.code == "OFFICE-VISUAL-UNAVAILABLE"
            else "failed"
        )
        comparison["diagnostic"] = str(exc)
        return finalize_evidence(result)
    comparison["implementation"] = implementation
    baseline_raster, candidate_raster = rasters[:2]
    if (
        baseline_raster.width != candidate_raster.width
        or baseline_raster.height != candidate_raster.height
    ):
        comparison["status"] = "failed"
        comparison["diagnostic"] = (
            "OFFICE-VISUAL-DIMENSIONS: baseline and candidate dimensions differ"
        )
        return finalize_evidence(result)

    width, height = baseline_raster.width, baseline_raster.height
    mask_raster = rasters[2] if resolved_mask is not None else None
    if mask_raster and (
        mask_raster.width != width or mask_raster.height != height
    ):
        comparison["status"] = "failed"
        comparison["diagnostic"] = (
            "OFFICE-VISUAL-MASK: mask dimensions differ from compared images"
        )
        return finalize_evidence(result)

    total_pixels = width * height
    ignored = [False] * total_pixels
    if mask_raster is not None:
        for index in range(total_pixels):
            offset = index * 4
            ignored[index] = max(mask_raster.rgba[offset : offset + 3]) >= 128
    masked_pixels = sum(ignored)
    masked_fraction = masked_pixels / total_pixels
    if masked_pixels == total_pixels or masked_fraction > max_masked_fraction:
        comparison["status"] = "failed"
        comparison["diagnostic"] = (
            "OFFICE-VISUAL-MASK: mask hides all pixels or exceeds its threshold"
        )
        comparison["mask"] = {
            "path": mask_path,
            "sha256": sha256_file(resolved_mask),
            "masked_fraction": masked_fraction,
            "white_means": "ignored",
        }
        return finalize_evidence(result)

    changed_pixels = 0
    max_delta = 0
    absolute_error = 0
    compared_pixels = total_pixels - masked_pixels
    changed_x: list[int] = []
    changed_y: list[int] = []
    for index in range(total_pixels):
        if ignored[index]:
            continue
        offset = index * 4
        deltas = [
            abs(
                baseline_raster.rgba[offset + channel]
                - candidate_raster.rgba[offset + channel]
            )
            for channel in range(4)
        ]
        pixel_max = max(deltas)
        max_delta = max(max_delta, pixel_max)
        absolute_error += sum(deltas)
        if pixel_max > antialias_tolerance:
            changed_pixels += 1
            changed_x.append(index % width)
            changed_y.append(index // width)

    changed_fraction = (
        changed_pixels / compared_pixels if compared_pixels else 0.0
    )
    mean_absolute_error = (
        absolute_error / (compared_pixels * 4) if compared_pixels else 0.0
    )
    metrics = {
        "total_pixels": total_pixels,
        "compared_pixels": compared_pixels,
        "masked_pixels": masked_pixels,
        "changed_pixels": changed_pixels,
        "changed_fraction": changed_fraction,
        "mean_absolute_error": mean_absolute_error,
        "max_channel_delta": max_delta,
    }
    comparison["dimensions"] = {
        "width_px": width,
        "height_px": height,
        "colorspace": "sRGB RGBA8",
    }
    comparison["metrics"] = metrics
    if resolved_mask is not None:
        comparison["mask"] = {
            "path": mask_path,
            "sha256": sha256_file(resolved_mask),
            "masked_fraction": masked_fraction,
            "white_means": "ignored",
        }
    if changed_x:
        min_x, max_x = min(changed_x), max(changed_x)
        min_y, max_y = min(changed_y), max(changed_y)
        comparison["changed_bounds"] = [
            min_x,
            min_y,
            max_x - min_x + 1,
            max_y - min_y + 1,
        ]

    passed = (
        changed_fraction <= max_changed_fraction
        and mean_absolute_error <= max_mean_absolute_error
        and max_delta <= max_channel_delta
    )
    comparison["status"] = "passed" if passed else "failed"
    comparison["diagnostic"] = (
        None
        if passed
        else "OFFICE-VISUAL-MISMATCH: one or more metrics exceed thresholds"
    )
    return finalize_evidence(result)


def _status_exit(status: str) -> int:
    return {
        "passed": 0,
        "failed": 1,
        "manual-required": 2,
        "unavailable": 3,
    }[status]


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Capture, compare, and validate Office visual evidence."
    )
    subparsers = parser.add_subparsers(dest="command_name", required=True)

    validate = subparsers.add_parser("validate")
    validate.add_argument("manifest", type=Path)
    validate.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    validate.add_argument("--no-check-files", action="store_true")

    capture = subparsers.add_parser("capture-quicklook")
    capture.add_argument("artifact", type=Path)
    capture.add_argument("--output", type=Path, required=True)
    capture.add_argument("--manifest", type=Path, required=True)
    capture.add_argument(
        "--lane", choices=["markdown-docx", "pptv-pptx"], required=True
    )
    capture.add_argument("--checkpoint", required=True)
    capture.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    capture.add_argument("--trusted", action="store_true")
    capture.add_argument("--pixel-size", type=int, default=1600)
    capture.add_argument("--timeout", type=float, default=30.0)

    browser_capture = subparsers.add_parser("capture-browser-svg")
    browser_capture.add_argument("artifact", type=Path)
    browser_capture.add_argument("--output", type=Path, required=True)
    browser_capture.add_argument("--manifest", type=Path, required=True)
    browser_capture.add_argument("--checkpoint", required=True)
    browser_capture.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    browser_capture.add_argument("--trusted", action="store_true")
    browser_capture.add_argument("--width-px", type=int, default=1600)
    browser_capture.add_argument("--height-px", type=int, default=900)
    browser_capture.add_argument("--background", default="#ffffff")
    browser_capture.add_argument("--timeout", type=float, default=30.0)

    compare = subparsers.add_parser("compare")
    compare.add_argument("baseline_manifest", type=Path)
    compare.add_argument("candidate_manifest", type=Path)
    compare.add_argument("--manifest", type=Path, required=True)
    compare.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    compare.add_argument("--mask")
    compare.add_argument("--antialias-tolerance", type=int, default=0)
    compare.add_argument("--max-changed-fraction", type=float, default=0.0)
    compare.add_argument("--max-mean-absolute-error", type=float, default=0.0)
    compare.add_argument("--max-channel-delta", type=int, default=0)
    compare.add_argument("--max-masked-fraction", type=float, default=0.0)

    record = subparsers.add_parser("record-status")
    record.add_argument("artifact", type=Path)
    record.add_argument("--manifest", type=Path, required=True)
    record.add_argument(
        "--lane", choices=["markdown-docx", "pptv-pptx"], required=True
    )
    record.add_argument("--checkpoint", required=True)
    record.add_argument(
        "--renderer-class", choices=sorted(RENDERER_CLASSES), required=True
    )
    record.add_argument(
        "--status", choices=["unavailable", "manual-required"], required=True
    )
    record.add_argument("--diagnostic", required=True)
    record.add_argument("--product", required=True)
    record.add_argument("--version", required=True)
    record.add_argument("--executable-path", default="manual")
    record.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        if args.command_name == "validate":
            manifest = load_manifest(args.manifest)
            errors = validate_manifest_data(
                manifest, args.root, check_files=not args.no_check_files
            )
            if errors:
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "code": "OFFICE-VISUAL-EVIDENCE-INVALID",
                            "errors": errors,
                        },
                        sort_keys=True,
                    )
                )
                return 1
            print(
                json.dumps(
                    {
                        "ok": True,
                        "schema": SCHEMA_ID,
                        "evidence_sha256": manifest["evidence_sha256"],
                    },
                    sort_keys=True,
                )
            )
            return 0

        if args.command_name == "capture-quicklook":
            manifest = capture_quicklook(
                args.artifact,
                args.output,
                root=args.root,
                lane=args.lane,
                checkpoint=args.checkpoint,
                trusted=args.trusted,
                pixel_size=args.pixel_size,
                timeout_seconds=args.timeout,
            )
        elif args.command_name == "capture-browser-svg":
            manifest = capture_browser_svg(
                args.artifact,
                args.output,
                root=args.root,
                checkpoint=args.checkpoint,
                trusted=args.trusted,
                width_px=args.width_px,
                height_px=args.height_px,
                background=args.background,
                timeout_seconds=args.timeout,
            )
        elif args.command_name == "compare":
            manifest = compare_evidence(
                load_manifest(args.baseline_manifest),
                load_manifest(args.candidate_manifest),
                root=args.root,
                mask_path=args.mask,
                antialias_tolerance=args.antialias_tolerance,
                max_changed_fraction=args.max_changed_fraction,
                max_mean_absolute_error=args.max_mean_absolute_error,
                max_channel_delta=args.max_channel_delta,
                max_masked_fraction=args.max_masked_fraction,
            )
        else:
            manifest = record_status(
                args.artifact,
                root=args.root,
                lane=args.lane,
                checkpoint=args.checkpoint,
                renderer_class=args.renderer_class,
                status=args.status,
                diagnostic=args.diagnostic,
                product=args.product,
                version=args.version,
                executable_path=args.executable_path,
            )
        write_manifest(args.manifest, manifest)
        status = (
            manifest.get("comparison", {}).get("status")
            or manifest["capture"]["status"]
        )
        print(
            json.dumps(
                {
                    "status": status,
                    "renderer_class": manifest["capture"]["renderer_class"],
                    "manifest": str(args.manifest),
                    "evidence_sha256": manifest["evidence_sha256"],
                },
                sort_keys=True,
            )
        )
        return _status_exit(status)
    except VisualEvidenceError as exc:
        print(json.dumps({"ok": False, "code": exc.code, "message": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
