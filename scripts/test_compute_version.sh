#!/usr/bin/env bash
# Tests for compute_version.sh. Each case builds a throwaway git repo, runs the
# script in it and checks the computed outputs and changelog.
# Usage: scripts/test_compute_version.sh
set -euo pipefail

# GitHub runners set this; cases opt in to it explicitly so nothing leaks into the job.
unset GITHUB_OUTPUT

SCRIPT="$(cd "$(dirname "$0")" && pwd)/compute_version.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

failures=0 passed=0 cases=0 case_name="" repo=""

new_repo() {
    case_name=$1
    cases=$((cases + 1))
    repo="$WORK/repo${cases}"
    mkdir "$repo"
    git -C "$repo" init -q
    git -C "$repo" config user.name test
    git -C "$repo" config user.email test@example.com
    git -C "$repo" config commit.gpgsign false
    git -C "$repo" config tag.gpgsign false
}

commit() {
    git -C "$repo" commit -q --allow-empty --cleanup=verbatim -m "$1"
}

tag() {
    git -C "$repo" tag "$1"
}

run() {
    (cd "$repo" && GITHUB_OUTPUT="$repo/out" "$SCRIPT")
}

fail() {
    echo "FAIL: ${case_name}: $1" >&2
    failures=$((failures + 1))
}

# expect <should_release> <version> [changelog substring...]
# A substring prefixed with "!" must not appear; "=N:<line>" means <line> appears exactly N times.
expect() {
    local want_release=$1 want_version=$2 got_release got_version needle count
    shift 2
    if ! run > /dev/null 2> "$repo/err"; then
        fail "script exited non-zero: $(cat "$repo/err")"
        return
    fi
    got_release=$(sed -n 's/^should_release=//p' "$repo/out")
    got_version=$(sed -n 's/^version=//p' "$repo/out")
    if [ "$got_release" != "$want_release" ] || [ "$got_version" != "$want_version" ]; then
        fail "expected should_release=${want_release} version=${want_version}, got should_release=${got_release} version=${got_version}"
        return
    fi
    for needle in "$@"; do
        case $needle in
            !*)
                if grep -qF -- "${needle#!}" "$repo/CHANGELOG_BODY.md"; then
                    fail "changelog should not contain '${needle#!}'"
                    return
                fi
                ;;
            =*)
                count=$(grep -cxF -- "${needle#*:}" "$repo/CHANGELOG_BODY.md" || true)
                if [ "$count" != "$(echo "${needle%%:*}" | tr -d =)" ]; then
                    fail "expected '${needle#*:}' ${needle%%:*} time(s), found ${count}"
                    return
                fi
                ;;
            *)
                if ! grep -qF -- "$needle" "$repo/CHANGELOG_BODY.md"; then
                    fail "changelog missing '${needle}'"
                    return
                fi
                ;;
        esac
    done
    passed=$((passed + 1))
}

squash_body() {
    local out="" line
    for line in "$@"; do
        out+="* ${line}"$'\n\n'
    done
    printf '%s' "$out"
}

# --- subjects (behaviour kept from the original script) -----------------------

new_repo "no tag, nothing conventional"
commit "initial"
commit "Update readme"
expect false 1.1.0

new_repo "no tag, feat starts from base version"
commit "feat: first"
expect true 1.2.0 "## v1.2.0" "- feat: first"

new_repo "fix subject is a patch"
commit "initial"; tag v2.1.0
commit "fix(engine): crash"
expect true 2.1.1 "### Fixes" "- fix(engine): crash"

new_repo "perf subject is a patch"
commit "initial"; tag v2.1.0
commit "perf: faster sampling"
expect true 2.1.1 "- perf: faster sampling"

new_repo "feat beats fix"
commit "initial"; tag v2.1.0
commit "fix: a"
commit "feat(ui): b"
expect true 2.2.0 "- feat(ui): b" "- fix: a"

new_repo "bang subject is a major on any type"
commit "initial"; tag v2.1.0
commit "refactor!: drop old protocol"
expect true 3.0.0 "### Breaking changes" "- refactor!: drop old protocol"

new_repo "chore/docs/ci do not release"
commit "initial"; tag v2.1.0
commit "docs: readme"
commit "chore(deps): bump"
commit "ci: cache"
expect false 2.1.0 "!###"

new_repo "only commits after the last tag count"
commit "feat: old"; tag v2.1.0
commit "fix: new"
expect true 2.1.1 "!feat: old"

new_repo "type is case-insensitive"
commit "initial"; tag v2.1.0
commit "Feat: capitalised"
expect true 2.2.0 "- Feat: capitalised"

new_repo "merge commit subject is ignored"
commit "initial"; tag v2.1.0
commit "Merge pull request #11 from someone/branch"
expect false 2.1.0

# --- squash-merge bodies (the PR #14 regression) ------------------------------

new_repo "PR #14: non-conventional squash title with feat bullets"
commit "initial"; tag v2.1.1
commit "Feat/drive temperatures (#14)"$'\n\n'"$(squash_body \
    "feat: drive temperatures on storage gauges with per-drive and per-sensor alert thresholds" \
    "fix(front_panel): restore hair-space tracking on gauge labels" \
    "feat(engine): show the internal SSD temperature on macOS storage gauges" \
    "docs: add drivetemp to the Linux server setup steps" \
    "Docs update")"
expect true 2.2.0 \
    "- feat: drive temperatures on storage gauges with per-drive and per-sensor alert thresholds" \
    "- feat(engine): show the internal SSD temperature on macOS storage gauges" \
    "- fix(front_panel): restore hair-space tracking on gauge labels" \
    "!docs:" "!Docs update" "!Feat/drive"

new_repo "squash body with only fixes is a patch"
commit "initial"; tag v2.1.0
commit "Frontend tweaks (#20)"$'\n\n'"$(squash_body "fix: a" "chore: b")"
expect true 2.1.1 "- fix: a" "!chore: b"

new_repo "squash body with only docs/chore does not release"
commit "initial"; tag v2.1.0
commit "Docs (#21)"$'\n\n'"$(squash_body "docs: a" "chore: b" "Docs update")"
expect false 2.1.0

new_repo "bang bullet in squash body is a major"
commit "initial"; tag v2.1.0
commit "Protocol v2 (#22)"$'\n\n'"$(squash_body "feat(engine)!: new wire format" "fix: a")"
expect true 3.0.0 "- feat(engine)!: new wire format"

new_repo "dash bullets are read too"
commit "initial"; tag v2.1.0
commit "Batch (#23)"$'\n\n'"- feat: dashed"
expect true 2.2.0 "- feat: dashed"

new_repo "conventional title duplicated in bullets is listed once"
commit "initial"; tag v2.1.0
commit "feat: gauges (#24)"$'\n\n'"$(squash_body "feat: gauges (#24)" "fix: b")"
expect true 2.2.0 "=1:- feat: gauges (#24)" "- fix: b"

new_repo "identical bullets across commits are listed once"
commit "initial"; tag v2.1.0
commit "A (#25)"$'\n\n'"$(squash_body "fix: same")"
commit "B (#26)"$'\n\n'"$(squash_body "fix: same")"
expect true 2.1.1 "=1:- fix: same"

new_repo "prose lines that look like headers are not bullets"
commit "initial"; tag v2.1.0
commit "Notes (#27)"$'\n\n'"feat: this is prose, not a bullet"$'\n'"  * feat: indented sub-bullet"
expect false 2.1.0

new_repo "CRLF bodies are handled"
commit "initial"; tag v2.1.0
commit "Win (#28)"$'\r\n\r\n'"* feat: from windows"$'\r\n'
expect true 2.2.0 "- feat: from windows"
if grep -q $'\r' "$repo/CHANGELOG_BODY.md"; then
    fail "changelog contains a carriage return"
fi

# --- BREAKING CHANGE footers --------------------------------------------------

new_repo "BREAKING CHANGE footer is a major"
commit "initial"; tag v2.1.0
commit "feat: new config"$'\n\n'"BREAKING CHANGE: config.toml moved"
expect true 3.0.0 "### Breaking changes" "- feat: new config"

new_repo "BREAKING-CHANGE synonym is a major"
commit "initial"; tag v2.1.0
commit "fix: a"$'\n\n'"BREAKING-CHANGE: b"
expect true 3.0.0

new_repo "BREAKING CHANGE footer inside a squash body is a major"
commit "initial"; tag v2.1.0
commit "Config (#29)"$'\n\n'"* feat: new config"$'\n\n'"BREAKING CHANGE: config.toml moved"
expect true 3.0.0 "- Config (#29)" "- feat: new config"

new_repo "BREAKING CHANGE mentioned mid-line is not a footer"
commit "initial"; tag v2.1.0
commit "docs: explain when to write BREAKING CHANGE: in a footer"$'\n\n'"Use BREAKING CHANGE: only for real breaks."
expect false 2.1.0

# --- output plumbing ----------------------------------------------------------

new_repo "writes to stdout without GITHUB_OUTPUT"
commit "initial"; tag v2.1.0
commit "fix: a"
if [ "$(cd "$repo" && "$SCRIPT")" = $'should_release=true\nversion=2.1.1\nprevious=2.1.0' ]; then
    passed=$((passed + 1))
else
    fail "unexpected stdout"
fi

echo "${passed} passed, ${failures} failed"
[ "$failures" -eq 0 ]
