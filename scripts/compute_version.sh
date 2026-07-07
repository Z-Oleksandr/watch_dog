#!/usr/bin/env bash
# Computes the next semver from Conventional Commits since the last v* tag.
# Outputs (to $GITHUB_OUTPUT if set, else stdout):
#   should_release=true|false
#   version=X.Y.Z
#   previous=X.Y.Z
# Writes the release changelog to CHANGELOG_BODY.md
set -euo pipefail

BASE_VERSION="1.1.0"

last_tag=$(git describe --tags --abbrev=0 --match "v*" 2>/dev/null || true)
if [ -n "$last_tag" ]; then
    previous="${last_tag#v}"
    range="${last_tag}..HEAD"
else
    previous="$BASE_VERSION"
    range="HEAD"
fi

major=0 minor=0 patch=0
feats=() fixes=() breaking=()

while IFS= read -r hash; do
    subject=$(git log -1 --format=%s "$hash")
    body=$(git log -1 --format=%b "$hash")

    if [[ "$subject" =~ ^[a-z]+(\([^\)]*\))?!: ]] || [[ "$body" == *"BREAKING CHANGE:"* ]]; then
        major=1
        breaking+=("$subject")
    elif [[ "$subject" =~ ^feat(\([^\)]*\))?: ]]; then
        minor=1
        feats+=("$subject")
    elif [[ "$subject" =~ ^(fix|perf)(\([^\)]*\))?: ]]; then
        patch=1
        fixes+=("$subject")
    fi
done < <(git rev-list --no-merges "$range")

IFS=. read -r v_major v_minor v_patch <<< "$previous"
if [ "$major" = 1 ]; then
    version="$((v_major + 1)).0.0"
elif [ "$minor" = 1 ]; then
    version="${v_major}.$((v_minor + 1)).0"
elif [ "$patch" = 1 ]; then
    version="${v_major}.${v_minor}.$((v_patch + 1))"
else
    version="$previous"
fi

should_release=false
if [ "$version" != "$previous" ]; then
    should_release=true
fi

{
    echo "## v${version}"
    echo
    if [ ${#breaking[@]} -gt 0 ]; then
        echo "### Breaking changes"
        printf -- '- %s\n' "${breaking[@]}"
        echo
    fi
    if [ ${#feats[@]} -gt 0 ]; then
        echo "### Features"
        printf -- '- %s\n' "${feats[@]}"
        echo
    fi
    if [ ${#fixes[@]} -gt 0 ]; then
        echo "### Fixes"
        printf -- '- %s\n' "${fixes[@]}"
        echo
    fi
} > CHANGELOG_BODY.md

out="${GITHUB_OUTPUT:-/dev/stdout}"
{
    echo "should_release=${should_release}"
    echo "version=${version}"
    echo "previous=${previous}"
} >> "$out"
