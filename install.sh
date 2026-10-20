#!/usr/bin/env bash
# Install zefpdf from GitHub, or update an existing install, then rebuild.
#
#   curl -fsSL https://raw.githubusercontent.com/HenryLF/zefpdf/main/install.sh | bash
#   ./install.sh [dir]            # from a checkout: updates that checkout
#
# Where it goes: the first argument, else $ZEFPDF_DIR, else the checkout this
# script sits in, else ~/.local/share/zefpdf. $ZEFPDF_REPO and $ZEFPDF_BRANCH
# pick another remote or branch for a fresh install.
#
# Running it again is the update: fast-forward to the remote, reinstall
# dependencies, rebuild. config.json and data.sqlite are yours and are kept;
# local edits to tracked files are stashed and put back after the pull.

set -euo pipefail

REPO="${ZEFPDF_REPO:-https://github.com/HenryLF/zefpdf.git}"
BRANCH="${ZEFPDF_BRANCH:-main}"

here=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi
if [ -n "${1:-}" ]; then
  DIR="$1"
elif [ -n "${ZEFPDF_DIR:-}" ]; then
  DIR="$ZEFPDF_DIR"
elif [ -n "$here" ] && [ -d "$here/.git" ]; then
  DIR="$here"
else
  DIR="$HOME/.local/share/zefpdf"
fi

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null || die "git is required"

if ! command -v bun >/dev/null; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
  else
    say "Installing Bun"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
fi

if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only --autostash
elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
  die "$DIR exists and is not a git checkout"
else
  say "Cloning $REPO into $DIR"
  git clone --branch "$BRANCH" "$REPO" "$DIR"
fi

cd "$DIR"
say "Installing dependencies"
bun install
say "Building"
bun run build
say "Linking the zefpdf command"
bun link

echo
say "Done ($(git rev-parse --short HEAD)). Run: zefpdf   (or: bun $DIR/server/index.ts)"
command -v zefpdf >/dev/null || echo "    add ~/.bun/bin to your PATH to get the zefpdf command"
