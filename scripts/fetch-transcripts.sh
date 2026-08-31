#!/usr/bin/env bash
# Fetch TikTok's own auto-caption track for every link in the owner corpus.
#
# WHY THIS IS A SCRIPT YOU RUN, AND NOT SOMETHING THE HARNESS DOES
#
# TikTok serves a JS challenge on the webpage request and refuses anonymous callers that have made
# more than a few dozen requests — measured 2026-08-31: roughly 35 requests, then `Unexpected
# response from webpage request` for hours afterwards. A browser session that is already signed in
# passes that challenge. Yours is; this machine's anonymous one is not.
#
# It reads cookies from YOUR browser, which is why an agent should not run it for you: on macOS
# Safari's cookie jar is TCC-protected and Chrome's needs your keychain password. Both are your
# credentials and your decision.
#
# It writes ONLY the subtitle track. No video, no audio, no media file is downloaded — `--skip-download`
# plus `--write-subs` fetches a few kilobytes of WebVTT and nothing else.
#
# THE STANDING POSITION THIS SITS AGAINST, so nobody mistakes it for a product feature:
# `docs/evidence/tiktok/08-engine2-access-surface-2026-08-31.md` establishes that no *sanctioned*
# route returns a transcript — the field exists (`voice_to_text`) behind an API that excludes
# commercial users. This is an unsanctioned route, opened for a university project on the owner's
# 2026-08-31 ruling, for MEASUREMENT ONLY, and it must be disclosed in the submission. It is not
# something the shipping product may do.
#
# Usage:  ./scripts/fetch-transcripts.sh [chrome|safari|firefox|edge]
set -euo pipefail

BROWSER="${1:-chrome}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/tests/manual/fixtures/transcripts"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

YTDLP="$(command -v yt-dlp || echo /tmp/ytdlp-venv/bin/yt-dlp)"
[ -x "$YTDLP" ] || { echo "yt-dlp not found. brew install yt-dlp"; exit 1; }

LINKS="$ROOT/tests/manual/owner-corpus-links.txt"
[ -f "$LINKS" ] || { echo "no $LINKS"; exit 1; }

mkdir -p "$OUT"
echo "reading cookies from $BROWSER; writing subtitle tracks only"
ok=0; miss=0
while read -r url; do
  [ -z "$url" ] && continue
  case "$url" in \#*) continue;; esac
  id="$(printf '%s' "$url" | sed -E 's#.*/video/([0-9]+).*#\1#')"
  if [ -f "$OUT/$id.vtt" ]; then echo "  have    $id"; continue; fi
  if "$YTDLP" --cookies-from-browser "$BROWSER" \
       --write-subs --write-auto-subs --sub-langs all --skip-download --no-warnings \
       --extractor-args "tiktok:api_hostname=api22-normal-c-useast2a.tiktokv.com" \
       -o "$WORK/%(id)s.%(ext)s" "$url" >/dev/null 2>&1 \
     && ls "$WORK/$id"*.vtt >/dev/null 2>&1; then
    cp "$WORK/$id"*.vtt "$OUT/$id.vtt"; echo "  GOT     $id"; ok=$((ok+1))
  else
    echo "  none    $id"; miss=$((miss+1))
  fi
  sleep 3
done < "$LINKS"

echo
echo "$ok fetched, $miss without a track or refused."
echo "Now rebuild the JSON fixture and re-measure:"
echo "  npx vitest run --config tests/manual/vitest.manual.config.ts tests/manual/transcript-lift.manual.ts --reporter=verbose"
