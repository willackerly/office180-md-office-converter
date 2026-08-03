#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Focused tests for CONTRACT:C11-OFFICE-VISUAL-EVIDENCE.1.2."""

from __future__ import annotations

import base64
import copy
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "visual-evidence"
SCRIPT = REPO_ROOT / "scripts" / "visual-evidence.py"
SPEC = importlib.util.spec_from_file_location("office180_visual_evidence", SCRIPT)
assert SPEC and SPEC.loader
visual = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = visual
SPEC.loader.exec_module(visual)

ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk"
    "+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


def copy_fixture(root: Path, name: str, destination: str) -> Path:
    path = root / destination
    path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(FIXTURES / name, path)
    return path


def capture_manifest(
    root: Path,
    *,
    artifact_name: str,
    image_name: str,
    image_fixture: str,
    checkpoint: str,
    lane: str = "markdown-docx",
) -> dict:
    artifact = root / artifact_name
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_bytes(f"trusted fixture {checkpoint}\n".encode())
    image = copy_fixture(root, image_fixture, image_name)
    image_hash = visual.sha256_file(image)
    return visual.finalize_evidence(
        {
            "schema": visual.SCHEMA_ID,
            "subject": {
                "lane": lane,
                "checkpoint": checkpoint,
                "artifact_path": artifact.relative_to(root).as_posix(),
                "artifact_sha256": visual.sha256_file(artifact),
            },
            "capture": {
                "renderer_class": "other",
                "status": "passed",
                "diagnostic": None,
                "renderer": {
                    "product": "C11 deterministic fixture renderer",
                    "version": "0.1",
                    "executable_path": "python-stdlib",
                },
                "environment": {
                    "os": "test",
                    "os_version": "1",
                    "architecture": "fixture",
                    "locale": "C",
                    "display_scale": 1.0,
                },
                "fonts": [],
                "input": {
                    "unit": "page",
                    "index": 1,
                    "pixel_size": 3,
                    "background": "opaque-white",
                },
                "command": {
                    "argv": ["fixture-render"],
                    "timeout_seconds": 1,
                    "exit_code": 0,
                    "stdout_sha256": visual.EMPTY_SHA256,
                    "stderr_sha256": visual.EMPTY_SHA256,
                },
                "output": {
                    "path": image.relative_to(root).as_posix(),
                    "sha256": image_hash,
                    "media_type": "image/x-portable-pixmap",
                    "width_px": 3,
                    "height_px": 2,
                    "colorspace": "sRGB",
                    "page_count": 1,
                    "page_sha256": [image_hash],
                },
            },
        }
    )


def native_bridge_report(
    root: Path,
    output: Path,
    *,
    media_kind: str,
) -> dict:
    profile = visual.BRIDGE_PROFILES[media_kind]
    input_path = root / f"bridge-input{profile['suffix']}"
    input_path.write_bytes(b"trusted bridge input")
    output_hash = visual.sha256_file(output)
    output_size = output.stat().st_size
    app = {
        "name": profile["application"],
        "bundle_id": profile["bundle_id"],
        "short_version": "16.111.2",
        "build_version": "26073101",
        "renderer_class": profile["renderer_class"],
    }
    return {
        "schema": visual.BRIDGE_SCHEMA_ID,
        "status": "passed",
        "phase": "complete",
        "input": {
            "path": input_path.relative_to(root).as_posix(),
            "sha256": visual.sha256_file(input_path),
            "bytes": input_path.stat().st_size,
            "media_kind": media_kind,
            "copy_verified": True,
        },
        "application": app,
        "environment": {
            "operating_system": "macOS",
            "version": "15.6",
            "architecture": "arm64",
        },
        "lifecycle": {
            "method": "non-interactive-nsworkspace+applescript",
            "timeout_seconds": 90,
            "evidence_scope": visual.BRIDGE_EVIDENCE_SCOPE,
            "representative_editability": "not-tested",
            "visual_fidelity": "not-tested",
            "handoff_attempts": 2,
            "handoff_accepted": 2,
            "exact_path_attachment": True,
            "read_only": False,
            "forced_dirty_save": True,
            "save_event_returned_saved": True,
            "post_save_saved": True,
            "save_quiescent": True,
            "closed_after_save": True,
            "zip_valid": True,
            "reopen_saved": True,
            "reopen_passed": True,
            "open_without_repair": True,
            "save_size": output_size,
            "save_sha256": output_hash,
            "quiescence_observations": 3,
            "quiescence_polls": 3,
            "bytes_changed": True,
            "part_count": 4,
            "uncompressed_bytes": 128,
            "reopen_sha256": output_hash,
        },
        "commands": [
            {
                "argv": [
                    "/usr/bin/osascript",
                    "<probe-script>",
                    "<work-copy>",
                ],
                "timeout_seconds": 3,
                "duration_ms": 1,
                "exit_code": 0,
                "timed_out": False,
                "stdout_sha256": visual.EMPTY_SHA256,
                "stderr_sha256": visual.EMPTY_SHA256,
                "script_sha256": "a" * 64,
                "phase": "post-save",
                "operation": "exact-path-probe",
            }
        ],
        "output": {
            "path": output.relative_to(root).as_posix(),
            "published": True,
            "sha256": output_hash,
            "bytes": output_size,
            "media_kind": media_kind,
        },
        "cleanup": {
            "exact_absence_proven": True,
            "work_directory_disposition": "removed",
        },
        "publication": {
            "commit_marker": "report",
            "pair_committed": True,
            "residual_limit": "The report was published last as the pair marker.",
        },
        "diagnostics": [],
    }


class VisualEvidenceTests(unittest.TestCase):
    def test_checked_vector180_roundtrip_evidence_is_self_consistent(self):
        root = (
            REPO_ROOT
            / "tests"
            / "fixtures"
            / "roundtrip-evidence"
            / "vector180"
        )
        manifest = json.loads(
            (root / "generation-manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            manifest["schema"],
            "office180-vector180-roundtrip-evidence-generation/0.1",
        )
        self.assertEqual(manifest["source"]["profile"], "0.1")
        self.assertEqual(manifest["c10"]["status"], "patchable")
        self.assertEqual(manifest["c10"]["changeCount"], 3)
        self.assertEqual(
            set(manifest["c10"]["operationKinds"]),
            {"set-text", "set-object-geometry", "set-native-style"},
        )
        self.assertEqual(manifest["c10"]["regeneratedStatus"], "unchanged")
        self.assertEqual(manifest["nativePowerPoint"]["status"], "manual-required")

        reproducibility_inputs = [
            manifest["generator"],
            *manifest["generator"]["dependencies"],
            {
                "path": manifest["source"]["font"]["path"],
                "sha256": manifest["source"]["font"]["sha256"],
            },
            {
                "path": manifest["source"]["font"]["licensePath"],
                "sha256": manifest["source"]["font"]["licenseSha256"],
            },
        ]
        for dependency in reproducibility_inputs:
            path = Path(dependency["path"])
            self.assertFalse(path.is_absolute())
            self.assertNotIn("..", path.parts)
            self.assertEqual(
                visual.sha256_file(REPO_ROOT / path),
                dependency["sha256"],
                dependency["path"],
            )

        evidence_paths = sorted(root.glob("*.evidence.json"))
        self.assertEqual(len(evidence_paths), manifest["c11ManifestCount"])
        for evidence_path in evidence_paths:
            evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
            self.assertEqual(
                visual.validate_manifest_data(evidence, root, check_files=True),
                [],
                evidence_path.name,
            )

        expected_files: set[str] = set()
        for line in (root / "SHA256SUMS").read_text(encoding="utf-8").splitlines():
            digest, separator, relative = line.partition("  ")
            self.assertEqual(separator, "  ")
            path = Path(relative)
            self.assertFalse(path.is_absolute())
            self.assertNotIn("..", path.parts)
            self.assertNotIn(relative, expected_files)
            expected_files.add(relative)
            self.assertEqual(visual.sha256_file(root / path), digest, relative)

        actual_files = {
            path.relative_to(root).as_posix()
            for path in root.iterdir()
            if path.is_file() and path.name != "SHA256SUMS"
        }
        self.assertEqual(actual_files, expected_files)

    def test_schema_and_manifest_sha_binding(self):
        schema = json.loads(
            (REPO_ROOT / "schemas" / "office180-visual-evidence-0.1.schema.json")
            .read_text(encoding="utf-8")
        )
        self.assertEqual(
            schema["properties"]["schema"]["const"],
            "office180-visual-evidence/0.1",
        )
        self.assertEqual(
            set(schema["$defs"]["status"]["enum"]),
            {"passed", "failed", "unavailable", "manual-required"},
        )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            manifest = capture_manifest(
                root,
                artifact_name="subject.docx",
                image_name="capture.ppm",
                image_fixture="baseline.ppm",
                checkpoint="generated",
            )
            self.assertEqual(
                visual.validate_manifest_data(manifest, root, check_files=True), []
            )
            reordered = json.loads(
                json.dumps(manifest, ensure_ascii=False, sort_keys=False)
            )
            self.assertEqual(
                visual.evidence_sha256(reordered), manifest["evidence_sha256"]
            )

            (root / "capture.ppm").write_bytes(b"tampered")
            errors = visual.validate_manifest_data(manifest, root, check_files=True)
            self.assertTrue(any("capture.output: sha256 mismatch" in e for e in errors))

            unknown = copy.deepcopy(manifest)
            unknown["capture"]["native_office"] = True
            unknown = visual.finalize_evidence(unknown)
            errors = visual.validate_manifest_data(
                unknown, root, check_files=False
            )
            self.assertIn("capture: unknown property native_office", errors)

    def test_bind_native_bridge_stays_manual_required_for_both_lanes(self):
        schema = json.loads(
            (REPO_ROOT / "schemas" / "office180-visual-evidence-0.1.schema.json")
            .read_text(encoding="utf-8")
        )
        native_schema = schema["$defs"]["nativeLifecycle"]
        self.assertEqual(
            native_schema["properties"]["evidence_scope"]["const"],
            visual.BRIDGE_EVIDENCE_SCOPE,
        )
        bridge_then = native_schema["allOf"][0]["then"]
        self.assertEqual(
            bridge_then["properties"]["status"]["const"],
            "manual-required",
        )
        self.assertFalse(
            bridge_then["properties"]["editability_checked"]["const"]
        )
        self.assertFalse(
            bridge_then["properties"]["visual_fidelity_checked"]["const"]
        )

        for media_kind, lane in (
            ("docx", "markdown-docx"),
            ("pptx", "vector180-pptx"),
            ("pptx", "pptv-pptx"),
        ):
            with self.subTest(media_kind=media_kind), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                capture = capture_manifest(
                    root,
                    artifact_name=f"native.{media_kind}",
                    image_name=f"native-{media_kind}.ppm",
                    image_fixture="baseline.ppm",
                    checkpoint="native-quicklook",
                    lane=lane,
                )
                artifact = root / f"native.{media_kind}"
                report = native_bridge_report(
                    root,
                    artifact,
                    media_kind=media_kind,
                )
                report_path = root / f"native-{media_kind}.bridge.json"
                report_path.write_text(
                    json.dumps(report, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8",
                )

                bound = visual.bind_native_bridge(
                    capture,
                    report_path,
                    root=root,
                )
                native = bound["native_lifecycle"]
                self.assertEqual(native["status"], "manual-required")
                self.assertEqual(native["method"], "automation")
                self.assertEqual(
                    native["evidence_scope"],
                    "native-no-op-save-lifecycle",
                )
                self.assertFalse(native["editability_checked"])
                self.assertFalse(native["visual_fidelity_checked"])
                self.assertTrue(native["open_without_repair"])
                self.assertTrue(native["zip_valid"])
                self.assertTrue(native["reopen_passed"])
                self.assertEqual(native["diagnostic"], visual.BRIDGE_DIAGNOSTIC)
                self.assertIn("structural lifecycle evidence only", native["diagnostic"])
                self.assertIn("human-reviewed visual fidelity", native["diagnostic"])
                self.assertEqual(
                    native["bridge_report_sha256"],
                    visual.sha256_file(report_path),
                )
                self.assertEqual(
                    visual.validate_manifest_data(
                        bound,
                        root,
                        check_files=True,
                    ),
                    [],
                )

    def test_native_bridge_binding_rejects_mismatch_failure_and_private_data(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            capture = capture_manifest(
                root,
                artifact_name="native.docx",
                image_name="native.ppm",
                image_fixture="baseline.ppm",
                checkpoint="native-quicklook",
            )
            artifact = root / "native.docx"
            base = native_bridge_report(root, artifact, media_kind="docx")
            cases = []

            failed = copy.deepcopy(base)
            failed["status"] = "failed"
            cases.append(("failed", failed))

            wrong_path = copy.deepcopy(base)
            wrong_path["output"]["path"] = "different.docx"
            cases.append(("wrong-path", wrong_path))

            wrong_app = copy.deepcopy(base)
            wrong_app["application"]["renderer_class"] = "native-powerpoint"
            cases.append(("wrong-app", wrong_app))

            private = copy.deepcopy(base)
            private["commands"][0]["argv"][-1] = "/Users/alice/private.docx"
            cases.append(("private", private))

            raw_output = copy.deepcopy(base)
            raw_output["commands"][0]["stdout"] = "document text"
            cases.append(("raw-output", raw_output))

            for name, report in cases:
                with self.subTest(name=name):
                    report_path = root / f"{name}.bridge.json"
                    report_path.write_text(
                        json.dumps(report, sort_keys=True) + "\n",
                        encoding="utf-8",
                    )
                    with self.assertRaises(visual.VisualEvidenceError) as context:
                        visual.bind_native_bridge(
                            capture,
                            report_path,
                            root=root,
                        )
                    self.assertEqual(
                        context.exception.code,
                        "OFFICE-VISUAL-EVIDENCE-INVALID",
                    )

    def test_native_bridge_report_digest_is_revalidated_after_binding(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            capture = capture_manifest(
                root,
                artifact_name="native.docx",
                image_name="native.ppm",
                image_fixture="baseline.ppm",
                checkpoint="native-quicklook",
            )
            artifact = root / "native.docx"
            report_path = root / "native.bridge.json"
            report_path.write_text(
                json.dumps(
                    native_bridge_report(root, artifact, media_kind="docx"),
                    sort_keys=True,
                )
                + "\n",
                encoding="utf-8",
            )
            bound = visual.bind_native_bridge(capture, report_path, root=root)
            self.assertEqual(
                visual.validate_manifest_data(bound, root, check_files=True),
                [],
            )

            report_path.write_text(
                report_path.read_text(encoding="utf-8") + "\n",
                encoding="utf-8",
            )
            errors = visual.validate_manifest_data(
                bound,
                root,
                check_files=True,
            )
            self.assertIn(
                "native_lifecycle.bridge_report: sha256 mismatch",
                errors,
            )

    def test_bind_native_bridge_cli_publishes_both_powerpoint_lanes(self):
        for lane in ("vector180-pptx", "pptv-pptx"):
            with self.subTest(lane=lane), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                capture = capture_manifest(
                    root,
                    artifact_name="native.pptx",
                    image_name="native.ppm",
                    image_fixture="baseline.ppm",
                    checkpoint="native-quicklook",
                    lane=lane,
                )
                capture_path = root / "native.quicklook.evidence.json"
                visual.write_manifest(capture_path, capture)
                artifact = root / "native.pptx"
                bridge_path = root / "native.bridge.json"
                bridge_path.write_text(
                    json.dumps(
                        native_bridge_report(root, artifact, media_kind="pptx"),
                        sort_keys=True,
                    )
                    + "\n",
                    encoding="utf-8",
                )
                output_path = root / "native.bound.evidence.json"
                result = subprocess.run(
                    [
                        sys.executable,
                        str(SCRIPT),
                        "bind-native-bridge",
                        str(capture_path),
                        str(bridge_path),
                        "--manifest",
                        str(output_path),
                        "--root",
                        str(root),
                    ],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    check=False,
                )
                self.assertEqual(result.returncode, 2, result.stderr.decode())
                summary = json.loads(result.stdout)
                self.assertEqual(summary["status"], "manual-required")
                self.assertEqual(
                    summary["renderer_class"],
                    "native-powerpoint",
                )
                bound = visual.load_manifest(output_path)
                self.assertEqual(
                    visual.validate_manifest_data(
                        bound,
                        root,
                        check_files=True,
                    ),
                    [],
                )

    def test_mocked_browser_svg_capture_binds_fixed_profile_and_hashes(self):
        calls = []

        def fake_which(name):
            return {
                "node": str(Path.home() / ".local" / "bin" / "node"),
                "pnpm": "/opt/test/bin/pnpm",
            }.get(name)

        def fake_run(command, **kwargs):
            calls.append((command, kwargs))
            if "validate" in command:
                artifact = Path(command[command.index("validate") + 1])
                result = {
                    "schema": "vector180-atom-validation/0.1",
                    "valid": True,
                    "sourceSha256": visual.sha256_file(artifact),
                    "atomId": "trusted",
                    "diagnostics": [],
                }
                return subprocess.CompletedProcess(
                    command, 0, json.dumps(result).encode(), b""
                )
            temporary_output = Path(command[command.index("--output") + 1])
            temporary_output.write_bytes(ONE_PIXEL_PNG)
            result = {
                "ok": True,
                "renderer": {
                    "product": "Playwright Chromium",
                    "playwrightVersion": "1.62.0",
                    "chromiumVersion": "143.0.0.0",
                    "executablePath": str(
                        Path.home()
                        / "Library"
                        / "Caches"
                        / "ms-playwright"
                        / "chromium"
                    ),
                },
                "profile": {
                    "widthPx": 1,
                    "heightPx": 1,
                    "deviceScaleFactor": 1,
                    "background": "#ffffff",
                    "fit": "contain",
                    "locale": "en-US",
                    "timezone": "UTC",
                    "javaScriptEnabled": False,
                    "loopbackOrigin": "http://127.0.0.1:<ephemeral>",
                    "renderingFlags": list(visual.BROWSER_RENDERING_FLAGS),
                },
            }
            return subprocess.CompletedProcess(
                command, 0, json.dumps(result).encode(), b""
            )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact = root / "reconciled.vector180.svg"
            artifact.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                encoding="utf-8",
            )
            output = root / "proof.png"
            with mock.patch.object(
                visual.shutil, "which", side_effect=fake_which
            ), mock.patch.object(visual.subprocess, "run", side_effect=fake_run):
                evidence = visual.capture_browser_svg(
                    artifact,
                    output,
                    root=root,
                    checkpoint="reconciled-browser-proof",
                    trusted=True,
                    width_px=1,
                    height_px=1,
                )

            self.assertEqual(len(calls), 2)
            self.assertEqual(evidence["capture"]["renderer_class"], "browser")
            self.assertEqual(evidence["capture"]["status"], "passed")
            self.assertEqual(evidence["subject"]["lane"], "vector180-pptx")
            self.assertIn("vector180", calls[0][0])
            self.assertEqual(evidence["subject"]["artifact_sha256"], visual.sha256_file(artifact))
            self.assertEqual(evidence["capture"]["output"]["sha256"], visual.sha256_file(output))
            self.assertEqual(
                evidence["capture"]["output"]["page_sha256"],
                [visual.sha256_file(output)],
            )
            self.assertEqual(
                evidence["capture"]["input"],
                {
                    "unit": "view",
                    "index": 1,
                    "pixel_size": 1,
                    "background": "#ffffff",
                    "viewport_width_px": 1,
                    "viewport_height_px": 1,
                    "device_scale_factor": 1.0,
                    "fit": "contain",
                },
            )
            self.assertEqual(evidence["capture"]["environment"]["locale"], "en-US")
            self.assertEqual(evidence["capture"]["environment"]["display_scale"], 1.0)
            self.assertEqual(
                evidence["capture"]["environment"]["rendering_flags"],
                list(visual.BROWSER_RENDERING_FLAGS),
            )
            self.assertTrue(
                evidence["capture"]["renderer"]["executable_path"].startswith(
                    "$HOME/"
                )
            )
            self.assertEqual(evidence["capture"]["fonts"], [])
            self.assertNotIn(str(root), evidence["capture"]["command"]["argv"])
            self.assertEqual(
                visual.validate_manifest_data(evidence, root, check_files=True),
                [],
            )

            missing_profile = copy.deepcopy(evidence)
            del missing_profile["capture"]["input"]["viewport_width_px"]
            missing_profile = visual.finalize_evidence(missing_profile)
            self.assertIn(
                "capture.input.viewport_width_px: required for passing browser capture",
                visual.validate_manifest_data(
                    missing_profile, root, check_files=False
                ),
            )

    def test_browser_svg_capture_rejects_untrusted_paths_and_unbounded_profile(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact = root / "atom.vector180.svg"
            artifact.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                encoding="utf-8",
            )
            output = root / "proof.png"

            with self.assertRaises(visual.VisualEvidenceError) as context:
                visual.capture_browser_svg(
                    artifact,
                    output,
                    root=root,
                    checkpoint="unsafe",
                    trusted=False,
                )
            self.assertEqual(context.exception.code, "OFFICE-VISUAL-UNSAFE-INPUT")

            wrong_suffix = root / "atom.svg"
            wrong_suffix.write_bytes(artifact.read_bytes())
            with self.assertRaises(visual.VisualEvidenceError) as context:
                visual.capture_browser_svg(
                    wrong_suffix,
                    output,
                    root=root,
                    checkpoint="wrong-suffix",
                    trusted=True,
                )
            self.assertEqual(
                context.exception.code, "OFFICE-VISUAL-EVIDENCE-INVALID"
            )

            with tempfile.TemporaryDirectory() as outside:
                outside_artifact = Path(outside) / "outside.vector180.svg"
                outside_artifact.write_bytes(artifact.read_bytes())
                with self.assertRaises(visual.VisualEvidenceError) as context:
                    visual.capture_browser_svg(
                        outside_artifact,
                        output,
                        root=root,
                        checkpoint="outside",
                        trusted=True,
                    )
                self.assertEqual(
                    context.exception.code, "OFFICE-VISUAL-UNSAFE-INPUT"
                )

            with self.assertRaises(visual.VisualEvidenceError) as context:
                visual.capture_browser_svg(
                    artifact,
                    output,
                    root=root,
                    checkpoint="unbounded",
                    trusted=True,
                    width_px=4097,
                )
            self.assertEqual(
                context.exception.code, "OFFICE-VISUAL-EVIDENCE-INVALID"
            )

            with self.assertRaises(visual.VisualEvidenceError) as context:
                visual.capture_browser_svg(
                    artifact,
                    output,
                    root=root,
                    checkpoint="unsafe-background",
                    trusted=True,
                    background="url(https://example.test)",
                )
            self.assertEqual(
                context.exception.code, "OFFICE-VISUAL-EVIDENCE-INVALID"
            )

    def test_browser_svg_capture_reports_validation_timeout_and_missing_browser(self):
        def fake_which(name):
            return {"node": "/opt/test/bin/node", "pnpm": "/opt/test/bin/pnpm"}.get(
                name
            )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact = root / "atom.vector180.svg"
            artifact.write_text(
                '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
                encoding="utf-8",
            )

            with mock.patch.object(
                visual.shutil,
                "which",
                side_effect=lambda name: (
                    "/opt/test/bin/node" if name == "node" else None
                ),
            ):
                missing_validator = visual.capture_browser_svg(
                    artifact,
                    root / "missing-validator.png",
                    root=root,
                    checkpoint="missing-validator",
                    trusted=True,
                )
            self.assertEqual(
                missing_validator["capture"]["status"], "unavailable"
            )
            self.assertTrue(
                missing_validator["capture"]["diagnostic"].startswith(
                    "OFFICE-VISUAL-UNAVAILABLE:"
                )
            )

            with mock.patch.object(
                visual.shutil, "which", side_effect=fake_which
            ), mock.patch.object(
                visual.subprocess,
                "run",
                side_effect=subprocess.TimeoutExpired("pnpm", 1),
            ):
                validation_timeout = visual.capture_browser_svg(
                    artifact,
                    root / "validation-timeout.png",
                    root=root,
                    checkpoint="validation-timeout",
                    trusted=True,
                )
            self.assertEqual(validation_timeout["capture"]["status"], "unavailable")
            self.assertTrue(
                validation_timeout["capture"]["diagnostic"].startswith(
                    "OFFICE-VISUAL-TIMEOUT:"
                )
            )

            validation_result = {
                "schema": "vector180-atom-validation/0.1",
                "valid": True,
                "sourceSha256": visual.sha256_file(artifact),
                "atomId": "trusted",
                "diagnostics": [],
            }
            missing_browser_result = {
                "ok": False,
                "code": "OFFICE-VISUAL-UNAVAILABLE",
                "message": "the pinned Playwright Chromium executable could not launch",
            }
            with mock.patch.object(
                visual.shutil, "which", side_effect=fake_which
            ), mock.patch.object(
                visual.subprocess,
                "run",
                side_effect=[
                    subprocess.CompletedProcess(
                        ["pnpm"],
                        0,
                        json.dumps(validation_result).encode(),
                        b"",
                    ),
                    subprocess.CompletedProcess(
                        ["node"],
                        3,
                        json.dumps(missing_browser_result).encode(),
                        b"",
                    ),
                ],
            ):
                missing_browser = visual.capture_browser_svg(
                    artifact,
                    root / "missing-browser.png",
                    root=root,
                    checkpoint="missing-browser",
                    trusted=True,
                )
            self.assertEqual(missing_browser["capture"]["status"], "unavailable")
            self.assertEqual(missing_browser["capture"]["command"]["exit_code"], 3)
            self.assertFalse((root / "missing-browser.png").exists())
            self.assertEqual(
                visual.validate_manifest_data(
                    missing_browser, root, check_files=True
                ),
                [],
            )

            helper_timeout = subprocess.TimeoutExpired(
                "node", 1, output=b'{"partial":', stderr=b"timeout"
            )
            with mock.patch.object(
                visual.shutil, "which", side_effect=fake_which
            ), mock.patch.object(
                visual.subprocess,
                "run",
                side_effect=[
                    subprocess.CompletedProcess(
                        ["pnpm"],
                        0,
                        json.dumps(validation_result).encode(),
                        b"",
                    ),
                    helper_timeout,
                ],
            ):
                timed_out = visual.capture_browser_svg(
                    artifact,
                    root / "browser-timeout.png",
                    root=root,
                    checkpoint="browser-timeout",
                    trusted=True,
                )
            self.assertEqual(timed_out["capture"]["status"], "unavailable")
            self.assertTrue(
                timed_out["capture"]["diagnostic"].startswith(
                    "OFFICE-VISUAL-TIMEOUT:"
                )
            )
            self.assertEqual(
                timed_out["capture"]["command"]["stdout_sha256"],
                visual.sha256_bytes(b'{"partial":'),
            )

    def test_exact_threshold_and_masked_comparisons(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline = capture_manifest(
                root,
                artifact_name="baseline.docx",
                image_name="baseline.ppm",
                image_fixture="baseline.ppm",
                checkpoint="baseline",
            )
            exact = capture_manifest(
                root,
                artifact_name="exact.docx",
                image_name="exact.ppm",
                image_fixture="baseline.ppm",
                checkpoint="exact",
            )
            changed = capture_manifest(
                root,
                artifact_name="changed.docx",
                image_name="changed.ppm",
                image_fixture="candidate-one-pixel.ppm",
                checkpoint="changed",
            )

            exact_result = visual.compare_evidence(baseline, exact, root=root)
            self.assertEqual(exact_result["comparison"]["status"], "passed")
            self.assertEqual(exact_result["comparison"]["metrics"]["changed_pixels"], 0)
            self.assertEqual(
                visual.validate_manifest_data(exact_result, root, check_files=True),
                [],
            )

            strict_result = visual.compare_evidence(baseline, changed, root=root)
            self.assertEqual(strict_result["comparison"]["status"], "failed")
            self.assertEqual(
                strict_result["comparison"]["diagnostic"].split(":", 1)[0],
                "OFFICE-VISUAL-MISMATCH",
            )
            self.assertEqual(strict_result["comparison"]["metrics"]["changed_pixels"], 1)
            self.assertEqual(
                strict_result["comparison"]["metrics"]["max_channel_delta"], 32
            )

            tolerated = visual.compare_evidence(
                baseline,
                changed,
                root=root,
                max_changed_fraction=1 / 6,
                max_mean_absolute_error=4,
                max_channel_delta=32,
            )
            self.assertEqual(tolerated["comparison"]["status"], "passed")

            copy_fixture(root, "mask-center.pgm", "mask.pgm")
            masked = visual.compare_evidence(
                baseline,
                changed,
                root=root,
                mask_path="mask.pgm",
                max_masked_fraction=1 / 6,
            )
            self.assertEqual(masked["comparison"]["status"], "passed")
            self.assertEqual(masked["comparison"]["metrics"]["changed_pixels"], 0)
            self.assertEqual(masked["comparison"]["mask"]["white_means"], "ignored")

    def test_dimension_and_mask_fail_closed(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            baseline = capture_manifest(
                root,
                artifact_name="baseline.docx",
                image_name="baseline.ppm",
                image_fixture="baseline.ppm",
                checkpoint="baseline",
            )
            changed = capture_manifest(
                root,
                artifact_name="changed.docx",
                image_name="changed.ppm",
                image_fixture="candidate-one-pixel.ppm",
                checkpoint="changed",
            )

            wrong_mask = root / "wrong-mask.pgm"
            wrong_mask.write_text("P2\n1 1\n255\n255\n", encoding="ascii")
            invalid_mask = visual.compare_evidence(
                baseline,
                changed,
                root=root,
                mask_path="wrong-mask.pgm",
                max_masked_fraction=1,
            )
            self.assertEqual(invalid_mask["comparison"]["status"], "failed")
            self.assertTrue(
                invalid_mask["comparison"]["diagnostic"].startswith(
                    "OFFICE-VISUAL-MASK:"
                )
            )

            all_mask = root / "all-mask.pgm"
            all_mask.write_text(
                "P2\n3 2\n255\n255 255 255\n255 255 255\n", encoding="ascii"
            )
            hidden_all = visual.compare_evidence(
                baseline,
                changed,
                root=root,
                mask_path="all-mask.pgm",
                max_masked_fraction=1,
            )
            self.assertEqual(hidden_all["comparison"]["status"], "failed")
            self.assertTrue(
                hidden_all["comparison"]["diagnostic"].startswith(
                    "OFFICE-VISUAL-MASK:"
                )
            )

            one_pixel = root / "one.ppm"
            one_pixel.write_text("P3\n1 1\n255\n0 0 0\n", encoding="ascii")
            dimension_candidate = copy.deepcopy(changed)
            dimension_candidate["capture"]["output"].update(
                {
                    "path": "one.ppm",
                    "sha256": visual.sha256_file(one_pixel),
                    "width_px": 1,
                    "height_px": 1,
                    "page_sha256": [visual.sha256_file(one_pixel)],
                }
            )
            dimension_candidate = visual.finalize_evidence(dimension_candidate)
            dimension_result = visual.compare_evidence(
                baseline, dimension_candidate, root=root
            )
            self.assertEqual(dimension_result["comparison"]["status"], "failed")
            self.assertTrue(
                dimension_result["comparison"]["diagnostic"].startswith(
                    "OFFICE-VISUAL-DIMENSIONS:"
                )
            )

    def test_quicklook_unavailable_manual_and_unsafe_are_explicit(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact = root / "document.docx"
            artifact.write_bytes(b"trusted generated package")
            output = root / "document.png"

            with mock.patch.object(visual.sys, "platform", "linux"), mock.patch.object(
                visual.shutil, "which", return_value=None
            ):
                unavailable = visual.capture_quicklook(
                    artifact,
                    output,
                    root=root,
                    lane="markdown-docx",
                    checkpoint="quick-look-smoke",
                    trusted=True,
                )
            self.assertEqual(unavailable["capture"]["renderer_class"], "quick-look")
            self.assertEqual(unavailable["capture"]["status"], "unavailable")
            self.assertNotIn("native_lifecycle", unavailable)
            self.assertFalse(output.exists())
            self.assertEqual(
                visual.validate_manifest_data(unavailable, root, check_files=True),
                [],
            )

            with self.assertRaises(visual.VisualEvidenceError) as context:
                visual.capture_quicklook(
                    artifact,
                    output,
                    root=root,
                    lane="markdown-docx",
                    checkpoint="unsafe",
                    trusted=False,
                )
            self.assertEqual(context.exception.code, "OFFICE-VISUAL-UNSAFE-INPUT")

            manual = visual.record_status(
                artifact,
                root=root,
                lane="markdown-docx",
                checkpoint="native-save-reopen",
                renderer_class="native-word",
                status="manual-required",
                diagnostic="Native editability needs an attended temporary-copy check.",
                product="Microsoft Word",
                version="manual-required",
                executable_path="manual",
            )
            self.assertEqual(manual["capture"]["status"], "manual-required")
            self.assertEqual(
                manual["native_lifecycle"]["status"], "manual-required"
            )
            self.assertEqual(
                visual.validate_manifest_data(manual, root, check_files=True), []
            )

    def test_mocked_quicklook_capture_covers_docx_and_pptx(self):
        capture_inputs = []

        def fake_run(command, **kwargs):
            if "-m" in command:
                return subprocess.CompletedProcess(
                    command,
                    0,
                    (
                        b"plugins:\n"
                        b"  org.openxmlformats.wordprocessingml.document -> "
                        b"/System/Library/QuickLook/Office.qlgenerator (48)\n"
                        b"  org.openxmlformats.presentationml.presentation -> "
                        b"/System/Library/QuickLook/Office.qlgenerator (48)\n"
                    ),
                    b"",
                )
            output_dir = Path(command[command.index("-o") + 1])
            capture_input = Path(command[-1])
            self.assertEqual(capture_input.parent, output_dir)
            self.assertTrue(capture_input.name.startswith("input-"))
            self.assertEqual(
                capture_input.read_bytes(), b"trusted generated package"
            )
            capture_inputs.append(capture_input.name)
            (output_dir / "preview.png").write_bytes(ONE_PIXEL_PNG)
            return subprocess.CompletedProcess(command, 0, b"generated\n", b"")

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with mock.patch.object(visual.sys, "platform", "darwin"), mock.patch.object(
                visual.shutil, "which", return_value="/usr/bin/qlmanage"
            ), mock.patch.object(visual.subprocess, "run", side_effect=fake_run):
                for suffix, lane, expected_unit in (
                    (".docx", "markdown-docx", "page"),
                    (".pptx", "pptv-pptx", "slide"),
                ):
                    artifact = root / f"artifact{suffix}"
                    artifact.write_bytes(b"trusted generated package")
                    output = root / f"artifact{suffix}.png"
                    evidence = visual.capture_quicklook(
                        artifact,
                        output,
                        root=root,
                        lane=lane,
                        checkpoint="quick-look-smoke",
                        trusted=True,
                        pixel_size=800,
                    )
                    self.assertEqual(evidence["capture"]["status"], "passed")
                    self.assertEqual(
                        evidence["capture"]["renderer_class"], "quick-look"
                    )
                    self.assertEqual(evidence["capture"]["input"]["unit"], expected_unit)
                    self.assertEqual(evidence["capture"]["output"]["width_px"], 1)
                    self.assertEqual(evidence["capture"]["output"]["height_px"], 1)
                    self.assertTrue(
                        evidence["capture"]["command"]["argv"][-1].startswith(
                            "$TEMP/input-"
                        )
                    )
                    self.assertNotIn("native_lifecycle", evidence)
                    self.assertEqual(
                        visual.validate_manifest_data(
                            evidence, root, check_files=True
                        ),
                        [],
                    )
                    if suffix == ".docx":
                        combined = copy.deepcopy(evidence)
                        combined["native_lifecycle"] = {
                            "renderer_class": "native-word",
                            "status": "manual-required",
                            "application": "Microsoft Word",
                            "version": "manual-required",
                            "method": "manual",
                            "diagnostic": (
                                "Native editability still needs an attended "
                                "temporary-copy check."
                            ),
                        }
                        combined = visual.finalize_evidence(combined)
                        self.assertEqual(
                            visual.validate_manifest_data(
                                combined, root, check_files=True
                            ),
                            [],
                        )
            self.assertEqual(len(capture_inputs), 2)
            self.assertTrue(capture_inputs[0].endswith(".docx"))
            self.assertTrue(capture_inputs[1].endswith(".pptx"))

    def test_quicklook_timeout_and_empty_output_never_pass(self):
        inventory = subprocess.CompletedProcess(
            ["qlmanage", "-m", "plugins"],
            0,
            (
                b"plugins:\n"
                b"  org.openxmlformats.wordprocessingml.document -> "
                b"/System/Library/QuickLook/Office.qlgenerator (48)\n"
            ),
            b"",
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            artifact = root / "artifact.docx"
            artifact.write_bytes(b"trusted generated package")

            with mock.patch.object(visual.sys, "platform", "darwin"), mock.patch.object(
                visual.shutil, "which", return_value="/usr/bin/qlmanage"
            ), mock.patch.object(
                visual.subprocess,
                "run",
                side_effect=[
                    inventory,
                    subprocess.TimeoutExpired("qlmanage", 1, output=b"", stderr=b""),
                ],
            ):
                timed_out = visual.capture_quicklook(
                    artifact,
                    root / "timeout.png",
                    root=root,
                    lane="markdown-docx",
                    checkpoint="timeout",
                    trusted=True,
                    timeout_seconds=1,
                )
            self.assertEqual(timed_out["capture"]["status"], "unavailable")
            self.assertTrue(
                timed_out["capture"]["diagnostic"].startswith(
                    "OFFICE-VISUAL-TIMEOUT:"
                )
            )

            with mock.patch.object(visual.sys, "platform", "darwin"), mock.patch.object(
                visual.shutil, "which", return_value="/usr/bin/qlmanage"
            ), mock.patch.object(
                visual.subprocess,
                "run",
                side_effect=[
                    inventory,
                    subprocess.CompletedProcess(["qlmanage"], 0, b"", b""),
                ],
            ):
                empty = visual.capture_quicklook(
                    artifact,
                    root / "empty.png",
                    root=root,
                    lane="markdown-docx",
                    checkpoint="empty",
                    trusted=True,
                )
            self.assertEqual(empty["capture"]["status"], "failed")
            self.assertTrue(
                empty["capture"]["diagnostic"].startswith("OFFICE-VISUAL-EMPTY:")
            )


if __name__ == "__main__":
    unittest.main()
