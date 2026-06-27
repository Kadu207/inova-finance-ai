#!/usr/bin/env bash
# Inova Finance AI — dev local (Postgres Docker + API + Web)
# Uso: ./scripts/dev-local.sh [start|stop|status|restart]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT=8810
WEB_PORT=3100
PG_PORT=5442
COMPOSE_DIR="$ROOT/infra/hetzner"
PID_DIR="$ROOT/.dev"
API_PID="$PID_DIR/app-api.pid"
WEB_PID="$PID_DIR/web.pid"
API_LOG="$PID_DIR/app-api.log"
WEB_LOG="$PID_DIR/web.log"

mkdir -p "$PID_DIR"

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  elif command -v sg >/dev/null 2>&1; then
    sg docker -c "docker $(printf '%q ' "$@")"
  else
    echo "Erro: sem permissão Docker. Execute: newgrp docker" >&2
    exit 1
  fi
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    export FNM_DIR="${FNM_DIR:-$HOME/.local/share/fnm}"
    export PATH="$FNM_DIR:$PATH"
    if [[ -x "$FNM_DIR/fnm" ]]; then
      eval "$("$FNM_DIR/fnm" env --shell bash)"
    fi
  fi
  command -v pnpm >/dev/null 2>&1 || { echo "Erro: pnpm não encontrado. Ative Node 20 + corepack." >&2; exit 1; }
}

port_in_use() {
  ss -tln 2>/dev/null | grep -q ":$1 "
}

kill_port() {
  local port=$1
  local pids
  pids=$(ss -tlnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' || true)
  if [[ -n "$pids" ]]; then
    echo "Encerrando processo(s) na porta $port: $pids"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
}

stop_pid_file() {
  local file=$1 name=$2
  if [[ -f "$file" ]]; then
    local pid
    pid=$(cat "$file")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Parando $name (PID $pid)..."
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$file"
  fi
}

cmd_stop() {
  echo "==> Parando serviços Inova Finance AI..."
  stop_pid_file "$API_PID" "App API"
  stop_pid_file "$WEB_PID" "Web"
  kill_port "$API_PORT"
  kill_port "$WEB_PORT"
  echo "✓ Portas $API_PORT e $WEB_PORT liberadas"
}

wait_postgres() {
  local i
  for i in $(seq 1 30); do
    if docker_cmd ps --filter name=hetzner-postgres --format '{{.Status}}' 2>/dev/null | grep -qi healthy; then
      return 0
    fi
    sleep 1
  done
  echo "Aviso: Postgres ainda não reportou healthy; tentando db:push mesmo assim..."
}

cmd_start() {
  ensure_node
  echo "==> [Agent 06 Infra] Subindo PostgreSQL (porta INA $PG_PORT)..."
  docker_cmd compose -f "$COMPOSE_DIR/docker-compose.yml" --env-file "$COMPOSE_DIR/.env" up -d postgres redis
  wait_postgres

  echo "==> [Agent 07 DB] Sincronizando schema Prisma..."
  pnpm db:push
  echo "==> [Agent 07 DB] Aplicando policies de RLS (isolamento multitenant)..."
  pnpm db:rls

  if port_in_use "$API_PORT"; then
    echo "Porta $API_PORT ocupada — liberando..."
    kill_port "$API_PORT"
  fi
  if port_in_use "$WEB_PORT"; then
    echo "Porta $WEB_PORT ocupada — liberando..."
    kill_port "$WEB_PORT"
  fi

  echo "==> [Agent 08 App API] Iniciando BFF na porta $API_PORT..."
  (pnpm --filter @inova/app-api dev >"$API_LOG" 2>&1 & echo $! >"$API_PID")

  local i
  for i in $(seq 1 20); do
    if curl -sf "http://127.0.0.1:$API_PORT/health" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  if grep -q "Demo data seeded in PostgreSQL" "$API_LOG" 2>/dev/null; then
    echo "✓ API conectada ao PostgreSQL (seed demo OK)"
  elif grep -q "using in-memory stores" "$API_LOG" 2>/dev/null; then
    echo "⚠ API em modo in-memory — verifique Postgres em localhost:$PG_PORT"
  fi

  echo "==> [Agent 09 Web] Iniciando Next.js na porta $WEB_PORT..."
  (pnpm --filter @inova/web dev >"$WEB_LOG" 2>&1 & echo $! >"$WEB_PID")

  for i in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:$WEB_PORT" >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done

  echo ""
  echo "════════════════════════════════════════════"
  echo "  Inova Finance AI — dev local ATIVO"
  echo "  Web:  http://localhost:$WEB_PORT"
  echo "  API:  http://127.0.0.1:$API_PORT"
  echo "  Login: admin@inova.local / changeme"
  echo "  Logs:  $API_LOG"
  echo "         $WEB_LOG"
  echo "  Parar: ./scripts/dev-local.sh stop"
  echo "════════════════════════════════════════════"
}

cmd_status() {
  echo "Docker Postgres:"
  docker_cmd ps --filter name=hetzner-postgres --format '  {{.Names}} — {{.Status}} — {{.Ports}}' 2>/dev/null || echo "  (sem acesso docker — rode: newgrp docker)"
  echo ""
  echo "Portas INA:"
  ss -tlnp 2>/dev/null | grep -E ":$API_PORT |:$WEB_PORT |:$PG_PORT " || echo "  (nenhuma em uso)"
  echo ""
  for pair in "App API:$API_PID:$API_LOG" "Web:$WEB_PID:$WEB_LOG"; do
    IFS=: read -r name pidfile logfile <<< "$pair"
    if [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
      echo "$name: rodando (PID $(cat "$pidfile"))"
      [[ -f "$logfile" ]] && tail -3 "$logfile" | sed 's/^/  /'
    else
      echo "$name: parado"
    fi
    echo ""
  done
}

case "${1:-start}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  *)
    echo "Uso: $0 {start|stop|restart|status}"
    exit 1
    ;;
esac
