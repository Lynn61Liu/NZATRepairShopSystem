#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/Users/lynn/www/wwwroot/NZAT.NET"

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
    /opt/homebrew/bin/docker \
    /usr/local/bin/docker \
    /usr/bin/docker \
    /Applications/Docker.app/Contents/Resources/bin/docker
  do
    if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

find_docker_compose_bin() {
  if [ -n "${DOCKER_COMPOSE_BIN:-}" ] && [ -x "${DOCKER_COMPOSE_BIN}" ]; then
    echo "${DOCKER_COMPOSE_BIN}"
    return 0
  fi

  for candidate in \
    "$(command -v docker-compose 2>/dev/null || true)" \
    /opt/homebrew/bin/docker-compose \
    /usr/local/bin/docker-compose
  do
    if [ -n "${candidate}" ] && [ -x "${candidate}" ]; then
      echo "${candidate}"
      return 0
    fi
  done

  return 1
}

write_docker_auth_config() {
  local docker_config_dir="$1"
  local registry="$2"
  local username="$3"
  local token="$4"
  local auth_b64

  auth_b64="$(printf '%s:%s' "${username}" "${token}" | base64 | tr -d '\n')"

  cat > "${docker_config_dir}/config.json" <<EOF
{
  "auths": {
    "${registry}": {
      "auth": "${auth_b64}"
    }
  }
}
EOF
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

export PATH="$(dirname "${DOCKER_BIN}"):/opt/homebrew/bin:/usr/local/bin:${PATH}"

if "${DOCKER_BIN}" compose version >/dev/null 2>&1; then
  COMPOSE_CMD=("${DOCKER_BIN}" compose)
elif DOCKER_COMPOSE_BIN="$(find_docker_compose_bin)"; then
  COMPOSE_CMD=("${DOCKER_COMPOSE_BIN}")
else
  echo "Neither 'docker compose' nor 'docker-compose' is available. Install Docker Desktop, or install docker-compose and ensure it exists under /opt/homebrew/bin or /usr/local/bin."
  exit 1
fi

GHCR_USERNAME="$(strip_wrapping_quotes "$(read_env_value GHCR_USERNAME || true)")"
GHCR_TOKEN="$(strip_wrapping_quotes "$(read_env_value GHCR_TOKEN || true)")"

if [ -z "${GHCR_USERNAME}" ] || [ -z "${GHCR_TOKEN}" ]; then
  echo "GHCR_USERNAME or GHCR_TOKEN is missing in .env"
  exit 1
fi

DOCKER_CONFIG_DIR="${DEPLOY_DIR}/.docker-config"
mkdir -p "${DOCKER_CONFIG_DIR}"
write_docker_auth_config "${DOCKER_CONFIG_DIR}" "ghcr.io" "${GHCR_USERNAME}" "${GHCR_TOKEN}"
export DOCKER_CONFIG="${DOCKER_CONFIG_DIR}"

"${COMPOSE_CMD[@]}" pull
"${COMPOSE_CMD[@]}" up -d --remove-orphans

echo "Secondary Mac deploy complete."
