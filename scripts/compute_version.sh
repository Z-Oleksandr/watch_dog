#!/usr/bin/env bash
# Computes the next semver from Conventional Commits since the last v* tag.
# A commit counts through its subject and through every "* <type>: ..." bullet
# in its body. GitHub lists the original commits that way in a squash merge, so
# a PR squashed under a non-conventional title ("Feat/foo (#14)") still bumps.
# Outputs (to $GITHUB_OUTPUT if set, else stdout):
#   should_release=true|false
#   version=X.Y.Z
#   previous=X.Y.Z
# Writes the release changelog to CHANGELOG_BODY.md
# Kept compatible with bash 3.2 (macOS) so it can be run locally.
set -euo pipefail

BASE_VERSION="1.1.0"

# <type>[(scope)][!]: <description>
HEADER_RE='^([A-Za-z]+)(\([^)]*\))?(!)?:'
# A squash-merge bullet ("* feat: ..."); "- " is accepted for hand-written lists.
BULLET_RE='^[*-][[:space:]]+(.+)$'
# Footer token at the start of a line, per the spec ("BREAKING-CHANGE" is a synonym).
BREAKING_FOOTER_RE='^BREAKING[ -]CHANGE:'

last_tag=$(git describe --tags --abbrev=0 --match "v*" 2>/dev/null || true)
if [ -n "$last_tag" ]; then
    previous="${last_tag#v}"
    range="${last_tag}..HEAD"
else
    previous="$BASE_VERSION"
    range="HEAD"
fi

# 0 = none, 1 = patch, 2 = minor, 3 = major
level=0
breaking="" feats="" fixes=""

bump() {
    if [ "$1" -gt "$level" ]; then
        level=$1
    fi
}

# Records one Conventional Commits header; anything else is ignored.
classify() {
    local header=$1 type
    [[ "$header" =~ $HEADER_RE ]] || return 0
    type=$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')

    if [ -n "${BASH_REMATCH[3]}" ]; then
        bump 3
        breaking+="${header}"$'\n'
    elif [ "$type" = feat ]; then
        bump 2
        feats+="${header}"$'\n'
    elif [ "$type" = fix ] || [ "$type" = perf ]; then
        bump 1
        fixes+="${header}"$'\n'
    fi
}

while IFS= read -r hash; do
    subject=$(git log -1 --format=%s "$hash")
    body=$(git log -1 --format=%b "$hash")

    classify "${subject%$'\r'}"

    while IFS= read -r line; do
        line=${line%$'\r'}
        if [[ "$line" =~ $BULLET_RE ]]; then
            classify "${BASH_REMATCH[1]}"
        elif [[ "$line" =~ $BREAKING_FOOTER_RE ]]; then
            bump 3
            breaking+="${subject%$'\r'}"$'\n'
        fi
    done <<< "$body"
done < <(git rev-list "$range")

IFS=. read -r v_major v_minor v_patch <<< "$previous"
case $level in
    3) version="$((v_major + 1)).0.0" ;;
    2) version="${v_major}.$((v_minor + 1)).0" ;;
    1) version="${v_major}.${v_minor}.$((v_patch + 1))" ;;
    *) version="$previous" ;;
esac

should_release=false
if [ "$version" != "$previous" ]; then
    should_release=true
fi

# Prints a changelog section, one bullet per distinct entry in first-seen order.
section() {
    local title=$1 entries=$2
    [ -n "$entries" ] || return 0
    echo "### ${title}"
    printf '%s' "$entries" | awk 'NF && !seen[$0]++ { print "- " $0 }'
    echo
}

{
    echo "## v${version}"
    echo
    section "Breaking changes" "$breaking"
    section "Features" "$feats"
    section "Fixes" "$fixes"
} > CHANGELOG_BODY.md

out="${GITHUB_OUTPUT:-/dev/stdout}"
{
    echo "should_release=${should_release}"
    echo "version=${version}"
    echo "previous=${previous}"
} >> "$out"
