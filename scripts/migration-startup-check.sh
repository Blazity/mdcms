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

verify_drizzle_migration_table() {
  local table_name
  table_name="$(
    docker compose exec -T postgres psql -U mdcms -d mdcms -tA -v ON_ERROR_STOP=1 \
      -c "SELECT to_regclass('drizzle.__drizzle_migrations');" | tr -d '\r'
  )"
  [[ "$table_name" == "drizzle.__drizzle_migrations" ]] ||
    fail "expected drizzle.__drizzle_migrations table to exist, got '$table_name'"
}

run_startup_cycle() {
  local label="$1"

  echo "Starting compose stack (${label})"
  docker compose up -d --build

  wait_for_service_completed_successfully db-migrate
  wait_for_service_healthy postgres
  wait_for_service_healthy redis
  wait_for_service_healthy minio
  wait_for_service_healthy mailhog
  wait_for_service_healthy server
  verify_server_health
  verify_drizzle_migration_table
}

trap cleanup EXIT

run_startup_cycle "initial"

echo "Restarting without dropping volumes to verify idempotent migration startup"
docker compose down
run_startup_cycle "restart"

echo "Migration startup verification passed"
