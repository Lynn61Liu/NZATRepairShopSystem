#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="/Users/lynn/www/wwwroot/NZAT.NET"
CURRENT_USER="$(id -un)"
DOCKER_RUN_AS_USER=""
DOCKER_CONFIG_DIR=""
DOCKER_CONFIG_IS_TEMP=0

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

print_docker_auth_config() {
  local registry="$1"
  local username="$2"
  local token="$3"
  local auth_b64

  auth_b64="$(printf '%s:%s' "${username}" "${token}" | base64 | tr -d '\n')"

  cat <<EOF
{
  "auths": {
    "${registry}": {
      "auth": "${auth_b64}"
    }
  }
}
EOF
}

write_docker_auth_config() {
  local docker_config_dir="$1"
  local registry="$2"
  local username="$3"
  local token="$4"

  if [ -n "${DOCKER_RUN_AS_USER}" ] && [ "${CURRENT_USER}" != "${DOCKER_RUN_AS_USER}" ]; then
    print_docker_auth_config "${registry}" "${username}" "${token}" | run_as_docker_user tee "${docker_config_dir}/config.json" >/dev/null
    return
  fi

  print_docker_auth_config "${registry}" "${username}" "${token}" > "${docker_config_dir}/config.json"
}

run_as_docker_user() {
  if [ -n "${DOCKER_RUN_AS_USER}" ] && [ "${CURRENT_USER}" != "${DOCKER_RUN_AS_USER}" ]; then
    sudo -u "${DOCKER_RUN_AS_USER}" -H "$@"
    return
  fi

  "$@"
}

run_compose() {
  run_as_docker_user env \
    "PATH=${PATH}" \
    "DOCKER_CONFIG=${DOCKER_CONFIG_DIR}" \
    "${COMPOSE_CMD[@]}" \
    "$@"
}

cleanup() {
  if [ "${DOCKER_CONFIG_IS_TEMP}" = "1" ] && [ -n "${DOCKER_CONFIG_DIR}" ]; then
    run_as_docker_user rm -rf "${DOCKER_CONFIG_DIR}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

cd "${DEPLOY_DIR}"

if [ ! -f .env ]; then
  echo ".env not found in ${DEPLOY_DIR}"
  exit 1
fi

DOCKER_RUN_AS_USER="$(strip_wrapping_quotes "$(read_env_value DOCKER_RUN_AS_USER || true)")"
DOCKER_BIN="$(strip_wrapping_quotes "$(read_env_value DOCKER_BIN || true)")"
DOCKER_BIN="$(find_docker_bin)" || {
  echo "docker executable not found. Set DOCKER_BIN in the shell environment if docker is installed in a custom path."
  exit 1
}

export PATH="$(dirname "${DOCKER_BIN}"):/opt/homebrew/bin:/usr/local/bin:${PATH}"

if run_as_docker_user "${DOCKER_BIN}" compose version >/dev/null 2>&1; then
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

if [ -n "${DOCKER_RUN_AS_USER}" ] && [ "${CURRENT_USER}" != "${DOCKER_RUN_AS_USER}" ]; then
  DOCKER_CONFIG_DIR="$(run_as_docker_user mktemp -d /tmp/nzat-docker-config.XXXXXX)"
  DOCKER_CONFIG_IS_TEMP=1
else
  DOCKER_CONFIG_DIR="${DEPLOY_DIR}/.docker-config"
  mkdir -p "${DOCKER_CONFIG_DIR}"
fi

write_docker_auth_config "${DOCKER_CONFIG_DIR}" "ghcr.io" "${GHCR_USERNAME}" "${GHCR_TOKEN}"

if [ -n "${DOCKER_RUN_AS_USER}" ] && [ "${CURRENT_USER}" != "${DOCKER_RUN_AS_USER}" ]; then
  run_as_docker_user chmod 600 "${DOCKER_CONFIG_DIR}/config.json"
fi

run_compose pull
run_compose up -d --remove-orphans

echo "Secondary Mac deploy complete."
