#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/www/wwwroot/NZAT.NET"

read_env_value() {
  local key="$1"
  awk -F= -v key="$key" '
    $0 ~ "^[[:space:]]*" key "=" {
      sub("^[[:space:]]*" key "=", "", $0)
      print $0
      exit
    }
  ' .env | tr -d '\r'
}

strip_wrapping_quotes() {
  local value="$1"

  if [ "${#value}" -ge 2 ]; then
    if [ "${value:0:1}" = "\"" ] && [ "${value: -1}" = "\"" ]; then
      value="${value:1:${#value}-2}"
    elif [ "${value:0:1}" = "'" ] && [ "${value: -1}" = "'" ]; then
      value="${value:1:${#value}-2}"
    fi
  fi

  printf '%s' "${value}"
}

find_docker_bin() {
  if [ -n "${DOCKER_BIN:-}" ] && [ -x "${DOCKER_BIN}" ]; then
    echo "${DOCKER_BIN}"
    return 0
  fi

  for candidate in \
    "$(command -v docker 2>/dev/null || true)" \
    /usr/local/bin/docker \
    /usr/bin/docker \
    /opt/homebrew/bin/docker \
    /Applications/Docker.app/Contents/Resources/bin/docker
  do
    if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

cd "${DEPLOY_DIR}"

if [ ! -f .env ]; then
  echo ".env not found in ${DEPLOY_DIR}"
  exit 1
fi

DOCKER_BIN="$(strip_wrapping_quotes "$(read_env_value DOCKER_BIN || true)")"
DOCKER_BIN="$(find_docker_bin)" || {
  echo "docker executable not found. Set DOCKER_BIN in the shell environment if docker is installed in a custom path."
  exit 1
}

if "${DOCKER_BIN}" compose version >/dev/null 2>&1; then
  COMPOSE_CMD=("${DOCKER_BIN}" compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=("$(command -v docker-compose)")
else
  echo "Neither 'docker compose' nor 'docker-compose' is available."
  exit 1
fi

GHCR_USERNAME="$(strip_wrapping_quotes "$(read_env_value GHCR_USERNAME || true)")"
GHCR_TOKEN="$(strip_wrapping_quotes "$(read_env_value GHCR_TOKEN || true)")"

if [ -z "${GHCR_USERNAME}" ] || [ -z "${GHCR_TOKEN}" ]; then
  echo "GHCR_USERNAME or GHCR_TOKEN is missing in .env"
  exit 1
fi

echo "${GHCR_TOKEN}" | "${DOCKER_BIN}" login ghcr.io -u "${GHCR_USERNAME}" --password-stdin

"${COMPOSE_CMD[@]}" pull
"${COMPOSE_CMD[@]}" up -d --remove-orphans

echo "Primary Linux deploy complete."
