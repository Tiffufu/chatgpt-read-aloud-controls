# Repository instructions

## Project and architecture

This is a plain Manifest V3 Chrome extension using HTML, CSS, and JavaScript.
There is no build step or package installation. Preserve that setup unless the
requested change requires otherwise.

Before runtime changes, read [development guidance](docs/DEVELOPMENT.md) and
the relevant [architecture boundaries](docs/ARCHITECTURE.md). For automatic
reading or queue changes, also read the [queue contract](docs/AUTO_READ_ALOUD.md).
Keep ChatGPT selectors in the adapter, media ownership in the player/session
helpers, and the drawer limited to presentation and semantic commands. Use the
shared settings contract and scoped DOM events across execution worlds.

## Verification

- For runtime changes, run `node --test tests/*.test.js`, syntax-check production
  JavaScript, and validate manifest assets as described in
  [development guidance](docs/DEVELOPMENT.md#run-checks).
- Add regression coverage for behavioral fixes where practical. Run the relevant
  browser fixtures and live smoke checks for playback or ChatGPT integration
  changes; automated tests alone do not establish live-site compatibility.
- For documentation-only changes, run `git diff --check` and check changed links,
  commands, filenames, and consistency. Runtime tests are unnecessary unless the
  change also affects executable code or configuration.
- Report what actually ran and its result. Distinguish automated tests, browser
  fixtures, live ChatGPT checks, and installation of the packaged ZIP. Explicitly
  identify required checks that could not be completed; never infer a pass from
  an older validation report.

## Branch naming

Use short, descriptive, lowercase branch names with hyphens, such as
`auto-read-aloud` or `fix-playback-timeout`. Do not add `codex/` or another
tool-name prefix unless the user explicitly requests it.

## Public documentation

Keep tracked documentation focused on usage, architecture, and reproducible checks.
Store local plans, session transcripts, machine paths, named browser profiles,
and review-service/account details outside the repository. Keep upstream credits
and included license notices intact. Rewriting published history requires an
explicit user request.

Update installation, usage, privacy, and architecture documentation when the
corresponding behavior changes. Treat [INSTALL.md](INSTALL.md) as the full
installation guide; keep the README and release quick-start steps consistent
with it. Write user instructions for people unfamiliar with GitHub.

## Releases

Follow [Prepare a release](docs/DEVELOPMENT.md#prepare-a-release) and copy the
[release template](.github/RELEASE_TEMPLATE.md) for every release, including
patches. GitHub does not automatically apply this Markdown template.

Every release must include:

- Standalone, numbered first-install instructions near the top, including a
  permanent folder, `chrome://extensions`, **Developer mode**, **Load unpacked**,
  selection of the folder containing `manifest.json`, and refreshing ChatGPT.
- The exact asset name `chatgpt-read-aloud-controls-unpacked.zip`, a direct link
  to that release's asset, and a distinction from GitHub's **Source code** archives.
- Separate manual-update instructions, including **Reload** and refreshing tabs.
- A link to `INSTALL.md` at the release tag, user-facing changes, and an accurate
  verification summary with any remaining limitations.

Keep the installation asset name stable. Verify that the release tag, manifest
version, changelog, and packaged ZIP agree and that the asset is attached before
publishing. Release documentation changes alone do not require a version bump
or replacement of an existing release asset.
