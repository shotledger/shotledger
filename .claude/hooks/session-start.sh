#!/bin/bash
# Cloud sessions (claude.ai/code) start on the image's Node, not the repo's.
# Install the version `.node-version` pins (#778), put it first on PATH for the
# session, then install the workspace so `pnpm check` runs on the real Node.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

version="$(tr -d '[:space:]' < .node-version)"
prefix="$HOME/.local/node-v$version"

if [ ! -x "$prefix/bin/node" ]; then
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echo "session-start: unsupported arch $(uname -m)" >&2; exit 1 ;;
  esac
  tarball="node-v$version-linux-$arch.tar.xz"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl -fsSL --retry 3 -o "$tmp/$tarball" "https://nodejs.org/dist/v$version/$tarball"
  curl -fsSL --retry 3 -o "$tmp/SHASUMS256.txt" "https://nodejs.org/dist/v$version/SHASUMS256.txt"
  (cd "$tmp" && grep " $tarball\$" SHASUMS256.txt | sha256sum -c -)
  mkdir -p "$prefix"
  tar -xJf "$tmp/$tarball" -C "$prefix" --strip-components=1
fi

export PATH="$prefix/bin:$PATH"
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$prefix/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# The pnpm `packageManager` names, installed into the pinned Node's prefix.
pnpm_version="$(node -p "require('./package.json').packageManager.split('@')[1]")"
if [ "$(pnpm --version 2>/dev/null || true)" != "$pnpm_version" ] ||
  [ "$(command -v pnpm)" != "$prefix/bin/pnpm" ]; then
  npm install -g --silent "pnpm@$pnpm_version"
fi

pnpm install
