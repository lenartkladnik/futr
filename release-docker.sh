#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 v1.2.3" >&2
  exit 1
fi

VERSION="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${DOCKER_IMAGE:-ghcr.io/lenartkladnik/futr}"
PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
TOKEN="${GHCR_TOKEN:-${CR_PAT:-${GITHUB_TOKEN:-}}}"

if [[ "$IMAGE" == ghcr.io/* && -n "$TOKEN" ]]; then
  OWNER="${IMAGE#ghcr.io/}"
  OWNER="${OWNER%%/*}"
  USERNAME="${GHCR_USERNAME:-${GITHUB_ACTOR:-$OWNER}}"

  echo "Logging into ghcr.io as $USERNAME..."
  printf '%s\n' "$TOKEN" | docker login ghcr.io -u "$USERNAME" --password-stdin >/dev/null
fi

echo "Publishing $IMAGE:$VERSION and $IMAGE:latest..."
docker buildx build \
  --platform "$PLATFORM" \
  --tag "$IMAGE:$VERSION" \
  --tag "$IMAGE:latest" \
  --push \
  "$ROOT_DIR"

echo "Done."
