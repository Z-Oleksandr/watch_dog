# Releasing

Releases are fully automated by `.github/workflows/release.yml` on every push to `main`.
Versioning is driven by **Conventional Commits** — the pipeline computes the bump from
commit messages since the last `v*` tag (`scripts/compute_version.sh`).

## Commit message convention

```
<type>[optional scope][!]: <subject>
```

| Commit | Bump |
| --- | --- |
| `fix: ...` / `perf: ...` | patch |
| `feat: ...` | minor |
| any type with `!` (e.g. `refactor!: ...`) or a `BREAKING CHANGE:` footer line in the body | major |
| anything else (`chore:`, `docs:`, `refactor:`, non-conventional) | none |

The type is case-insensitive. The highest bump among all commits since the last
tag wins. If no commit warrants a bump, **no release is created**.

### Squash and merge commits

Each commit is read through its subject **and** every `* <type>: ...` (or
`- <type>: ...`) bullet in its body. A GitHub squash merge lists the PR's
original commits as such bullets, so a PR squashed under a non-conventional
title (e.g. GitHub's default `Feat/drive temperatures (#14)`) still bumps from
the commits inside it. A conventional PR title counts as well; entries that
appear in both the title and the bullets are listed once in the changelog.

Prose lines and indented sub-bullets are not read. GitHub's default
"Merge pull request #NN" subjects match nothing, but with a merge commit the
PR's own commits land on `main` and are counted individually.

`scripts/test_compute_version.sh` covers these rules. It runs in CI and before
every release.

## What a release produces

- Git tag `vX.Y.Z` on the released commit.
- GitHub Release with a changelog grouped by breaking/features/fixes.
- Assets:
  - `engine-linux-x86_64-vX.Y.Z.tar.gz`
  - `engine-windows-x86_64-vX.Y.Z.zip`
  - `engine-macos-arm64-vX.Y.Z.tar.gz`
  - `watch_dog-vX.Y.Z-full.tar.gz` — the whole app with prebuilt `front_panel/dist`
    and engine binaries in `engine/app_linux|app_windows|app_macos`, ready to run
    with `npm ci --omit=dev` (no Rust or webpack needed on the target).
  - `SHA256SUMS`

Version numbers in `engine/Cargo.toml`, `package.json` and `front_panel/package.json`
are injected at build time from the computed version; the git tag is the source of
truth. Engine binaries are not committed to the repository.

## CI

`.github/workflows/ci.yml` runs on every PR and push to `main`: engine
`cargo build` + `cargo test` (blocking) with `fmt`/`clippy` advisories, and for
the front panel ESLint, Prettier, Vitest, the webpack production build and
`npm audit` on runtime dependencies (all blocking), plus ShellCheck and the
version computation tests for `scripts/` (blocking).
