# Immutable native-Office baselines

These are generated challenge inputs, not source authority and not a place for
human edits. The authorities are the Markdown and two `.pptv.svg` atoms one
directory above. Each Office file is paired with hash-bound visual evidence;
each PPTX also has the exact C9 source map required for reconciliation.

The DOCX was generated from the fixed public-safe path
`/private/tmp/office180-evidence/office180-primer.md`. That preserves the
current C2 provenance contract without embedding a workstation username or
repository path. The PPTX core metadata uses only the fixed `office180`
identity.

To run the challenge, open these files and save edits beside the parent
README under its prescribed `.edited.docx` / `.edited.pptx` names. Never save
over these baselines. Native Office work files, lock files, and verification
runs are ignored; this directory is the clean reproducible branch.

`evidence/` is C11 preview evidence, not a claim that Word or PowerPoint
performed a representative edit. A separately bound native-bridge report can
prove a no-op open/save/reopen lifecycle while leaving representative
editability and human visual review explicitly manual.
