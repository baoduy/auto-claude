#!/usr/bin/env bash
set -euo pipefail

detect_os() {
  case "${OSTYPE:-$(uname -s 2>/dev/null | tr '[:upper:]' '[:lower:]')}" in
    darwin*)              echo "macos" ;;
    linux*|gnu*)          echo "linux" ;;
    msys*|cygwin*|mingw*) echo "windows" ;;
    *)
      case "$(uname -s 2>/dev/null)" in
        Darwin)                       echo "macos" ;;
        Linux)                        echo "linux" ;;
        MINGW*|MSYS*|CYGWIN*|Windows*) echo "windows" ;;
        *)                            echo "unknown" ;;
      esac
      ;;
  esac
}

is_claude_desktop_installed_macos() {
  local app_paths=(
    "/Applications/Claude.app"
    "$HOME/Applications/Claude.app"
    "/Applications/Claude Desktop.app"
    "$HOME/Applications/Claude Desktop.app"
  )
  local app_path
  for app_path in "${app_paths[@]}"; do
    [[ -d "$app_path" ]] && return 0
  done
  if command -v mdfind >/dev/null 2>&1; then
    if mdfind 'kMDItemCFBundleIdentifier == "com.anthropic.claude"' 2>/dev/null | grep -q '\.app$'; then
      return 0
    fi
  fi
  return 1
}

is_claude_desktop_installed_linux() {
  local paths=(
    "/opt/Claude"
    "/opt/claude"
    "/usr/bin/claude-desktop"
    "/usr/local/bin/claude-desktop"
    "$HOME/.local/bin/claude-desktop"
    "$HOME/.local/share/applications/claude-desktop.desktop"
    "$HOME/.local/share/applications/Claude.desktop"
  )
  local p
  for p in "${paths[@]}"; do
    [[ -e "$p" ]] && return 0
  done
  command -v claude-desktop >/dev/null 2>&1 && return 0
  if command -v flatpak >/dev/null 2>&1; then
    flatpak list --app 2>/dev/null | grep -qi 'claude' && return 0
  fi
  if command -v snap >/dev/null 2>&1; then
    snap list 2>/dev/null | grep -qi 'claude' && return 0
  fi
  return 1
}

# Convert Windows path to bash-friendly path under MSYS/Cygwin/WSL.
win_to_bash() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$p" 2>/dev/null && return 0
  fi
  # WSL
  if [[ -d /mnt/c ]] && [[ "$p" =~ ^([A-Za-z]):[\\/](.*)$ ]]; then
    local drive="${BASH_REMATCH[1],,}"
    local rest="${BASH_REMATCH[2]//\\//}"
    echo "/mnt/$drive/$rest"
    return 0
  fi
  echo "$p"
}

is_claude_desktop_installed_windows() {
  local localappdata="${LOCALAPPDATA:-$USERPROFILE/AppData/Local}"
  local appdata="${APPDATA:-$USERPROFILE/AppData/Roaming}"
  local programfiles="${ProgramFiles:-C:/Program Files}"

  local raw_paths=(
    "$localappdata/AnthropicClaude/Claude.exe"
    "$localappdata/Programs/claude/Claude.exe"
    "$localappdata/Programs/Claude/Claude.exe"
    "$appdata/Claude"
    "$programfiles/Claude/Claude.exe"
  )
  local p converted
  for p in "${raw_paths[@]}"; do
    converted="$(win_to_bash "$p")"
    [[ -e "$converted" ]] && return 0
  done

  if command -v powershell.exe >/dev/null 2>&1; then
    if powershell.exe -NoProfile -Command \
      "if (Get-AppxPackage -Name *Claude* -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" \
      >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

OS="$(detect_os)"

case "$OS" in
  macos)   is_claude_desktop_installed_macos   && installed=1 || installed=0 ;;
  linux)   is_claude_desktop_installed_linux   && installed=1 || installed=0 ;;
  windows) is_claude_desktop_installed_windows && installed=1 || installed=0 ;;
  *)
    echo "Unsupported OS: ${OSTYPE:-unknown}. Supported: macOS, Linux, Windows."
    exit 1
    ;;
esac

if [[ "$installed" -eq 1 ]]; then
  echo "Claude Desktop detected on $OS. Running auto-claude default + update..."
  npx @drunkcoding/auto-claude default
  npx @drunkcoding/auto-claude update
  echo "Done."
else
  echo "Claude Desktop is not installed on $OS. Skipping auto-claude commands."
  exit 1
fi
