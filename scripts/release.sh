#!/usr/bin/env bash
# Usage: ./scripts/release.sh [patch|minor|major]
# Default: patch (0.0.1 → 0.0.2)
set -euo pipefail

BUMP="${1:-patch}"

# Get latest tag
LATEST=$(git tag --sort=-v:refname | grep '^v' | head -1 2>/dev/null || echo "v0.0.0")
VERSION="${LATEST#v}"

IFS='.' read -r MAJOR MINOR PATCH <<< "$VERSION"

case "$BUMP" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
  *) echo "Usage: $0 [patch|minor|major]"; exit 1 ;;
esac

NEW_TAG="v${MAJOR}.${MINOR}.${PATCH}"

echo "Current: $LATEST → New: $NEW_TAG ($BUMP)"
echo ""

# Show what will be included
echo "Commits since $LATEST:"
git log "${LATEST}..HEAD" --oneline 2>/dev/null || git log --oneline
echo ""

read -p "Tag and push $NEW_TAG? [y/N] " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  git tag -a "$NEW_TAG" -m "Release $NEW_TAG"
  git push origin "$NEW_TAG"
  echo ""
  echo "Tagged and pushed $NEW_TAG — deploy workflow triggered."
  echo "Watch: https://github.com/Om2524/astropersonalised/actions"
else
  echo "Cancelled."
fi
