# Maintainer guide

Users install Scene Reader, plus its existing Jev server plugin. Character Reasoner is not a runtime dependency. Runtime code never fetches or imports files from that extension.

## Canonical extraction engine

Edit schema, enums, compiler prompt, parser, normalization or validation in Character_Reasoner/core/index.js first. Test there with `node test.mjs` and push main. Scene Reader keeps a vendored copy. Its scheduled GitHub Action checks upstream every six hours; Actions → Sync Character Reasoner core → Run workflow checks immediately. Only core-file changes trigger a sync. The action tests source, integration and browser behavior, rebuilds ZIPs, then pushes the copy. Failures leave main unchanged. Actions must be enabled and main must allow its token to push. A protected main may require a manual integration instead. GitHub schedules can be delayed.

Local workflow:

```text
node scripts/sync-character-core.mjs ../character-reasoner
node scripts/sync-character-core.mjs ../character-reasoner --check
python scripts/package.py
node scripts/check.mjs
node tests/browser.mjs
```

The browser suite needs Playwright and Chromium (or CHROME_PATH). Do not edit the vendored files directly. sync.json records the exact source commit and SHA-256; version.js carries that hash into saved banks. A core change marks old banks stale even if an upstream version number was not bumped. Re-extract affected characters after updating. User-installed extensions receive repository updates through SillyTavern; editing a developer checkout does not modify user installations by itself.

## Ownership and scope

Character Reasoner owns extraction. Scene Reader owns candidate filtering, live record selection, access checks, progression, appearance offers, continuity and injection. Production uses canonicalOnly; old profiles remain recovery data and require re-extraction. Selected rules retain condition, target, modality and knowledge state. Per-person live acquisitions remain separate. Registered identities never revert to generated-NPC ownership.

The appearance offer is a routing proposal, not an established person. New presence and other plans commit only after output verification. A draw is reused for retries of the same user opportunity. Development style controls movement type; intensity adjusts only explicitly allowed low-risk routing. Fact, access, creation, pacing and verification standards do not use it. Memory-reference wiring is reserved and disabled independently of source lorebook selection.

## Release checks

1. Source and structural regression: canonical-core equality, record validation, 162 setting combinations, persistence/rollback and failed operations.
2. UI integration: 320/390/768/1280 widths, four tabs, settings save/reset, source lorebook compile, Jev selection/injection and world edits; inspect screenshots.
3. Distribution: build ZIPs, validate contained import paths and byte equality, rerun checks from the final release tree, check docs/links, review Git diff for credentials and stale files.

Mocked model responses prove plumbing and invariants, not live Jev output quality. Never claim a live-model test unless one was performed. Keep tests and source; omit plans, test artifacts and internal docs from installation ZIPs.
