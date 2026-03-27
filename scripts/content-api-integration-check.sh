#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

cleanup() {
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
}

wait_for_service_healthy() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local elapsed=0
  local container_id
  local status

  container_id="$(docker compose ps --all -q "$service")"
  [[ -n "$container_id" ]] || fail "service '$service' has no container id"

  while ((elapsed < timeout_seconds)); do
    status="$(
      docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id"
    )"

    if [[ "$status" == "healthy" || "$status" == "running" ]]; then
      return 0
    fi

    if [[ "$status" == "unhealthy" || "$status" == "exited" || "$status" == "dead" ]]; then
      docker compose logs "$service" || true
      fail "service '$service' reached terminal status '$status'"
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  docker compose logs "$service" || true
  fail "service '$service' did not become healthy within ${timeout_seconds}s"
}

wait_for_service_completed_successfully() {
  local service="$1"
  local timeout_seconds="${2:-180}"
  local elapsed=0
  local container_id
  local status
  local exit_code

  container_id="$(docker compose ps -a -q "$service")"
  [[ -n "$container_id" ]] || fail "service '$service' has no container id"

  while ((elapsed < timeout_seconds)); do
    status="$(docker inspect --format '{{.State.Status}}' "$container_id")"

    if [[ "$status" == "exited" ]]; then
      exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$container_id")"
      [[ "$exit_code" == "0" ]] ||
        fail "service '$service' exited with code $exit_code"
      return 0
    fi

    if [[ "$status" == "dead" ]]; then
      fail "service '$service' entered dead state"
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  docker compose logs "$service" || true
  fail "service '$service' did not complete within ${timeout_seconds}s"
}

verify_server_health() {
  local response
  response="$(curl --fail --silent --show-error http://127.0.0.1:4000/healthz)"
  [[ "$response" == *'"status":"ok"'* ]] ||
    fail "server /healthz response missing status=ok: $response"
}

trap cleanup EXIT

echo "Resetting any existing compose stack"
cleanup

echo "Starting compose stack for content API integration tests"
docker compose up -d --build

wait_for_service_completed_successfully db-migrate
wait_for_service_healthy postgres
wait_for_service_healthy server
verify_server_health

echo "Running DB-backed content API integration suite"
bun run --cwd apps/server test:integration:content

echo "Content API integration verification passed"
