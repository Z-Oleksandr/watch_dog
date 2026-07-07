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
| any type with `!` (e.g. `refactor!: ...`) or `BREAKING CHANGE:` in the body | major |
| anything else (`chore:`, `docs:`, `refactor:`, non-conventional) | none |

If no commit since the last tag warrants a bump, **no release is created**.
Merges count by their individual commits (merge commits themselves are ignored),
so squash-merges need a conventional subject to release.

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
`cargo build` + `cargo test` (blocking) with `fmt`/`clippy` advisories, and the
webpack production build of the front panel.
