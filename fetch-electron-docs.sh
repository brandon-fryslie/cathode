#!/usr/bin/env bash
# Fetches all Electron API docs (markdown) from the electron/electron repo on GitHub.
# Usage: ./fetch-electron-docs.sh [output_dir]

set -euo pipefail

OUTPUT_DIR="${1:-electron-docs}"
BRANCH="main"
REPO="electron/electron"
API_URL="https://api.github.com/repos/${REPO}/contents/docs/api?ref=${BRANCH}"
RAW_BASE="https://raw.githubusercontent.com/${REPO}/${BRANCH}/docs/api"

mkdir -p "${OUTPUT_DIR}"

echo "Fetching file list from ${REPO}/docs/api ..."
files=$(curl -sS "${API_URL}" | python3 -c "
import json, sys
entries = json.load(sys.stdin)
for e in entries:
    if e['type'] == 'file' and e['name'].endswith('.md'):
        print(e['name'])
")

count=$(echo "${files}" | wc -l | tr -d ' ')
echo "Found ${count} API doc files."

i=0
for file in ${files}; do
    i=$((i + 1))
    echo "[${i}/${count}] Downloading ${file} ..."
    curl -sS "${RAW_BASE}/${file}" -o "${OUTPUT_DIR}/${file}"
done

echo "Done. All API docs saved to ${OUTPUT_DIR}/"
