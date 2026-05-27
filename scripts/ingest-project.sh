#!/usr/bin/env bash
set -euo pipefail

# --- Configuración ---
API_URL="${API_URL:-http://localhost:3000}"
DOMAIN=""
PROJECT_DIR=""
MAX_FILE_SIZE=500000  # 500KB max por archivo

usage() {
  cat <<'USAGE'
Ingestar un proyecto completo en el AI SDLC System.

Uso:
  ./scripts/ingest-project.sh <directorio> --domain <nombre>

Opciones:
  --domain <nombre>   Dominio para agrupar el conocimiento (requerido)
  --api <url>         URL de la API (default: http://localhost:3000)
  --force             Re-ingestar archivos que ya existen
  --dry-run           Mostrar qué se ingesta sin ejecutar
  --include <patrón>  Incluir solo archivos que matcheen (puede repetirse)

Ejemplos:
  # Ingestar un proyecto NestJS completo
  ./scripts/ingest-project.sh ~/projects/mi-app --domain mi-app

  # Solo los servicios y controllers
  ./scripts/ingest-project.sh ~/projects/mi-app --domain mi-app \
    --include "*.service.ts" --include "*.controller.ts"

  # Ver qué se ingesta sin hacerlo
  ./scripts/ingest-project.sh ~/projects/mi-app --domain mi-app --dry-run

  # Re-ingestar (sobreescribir todo)
  ./scripts/ingest-project.sh ~/projects/mi-app --domain mi-app --force
USAGE
  exit 1
}

# --- Extensiones relevantes para análisis de código ---
EXTENSIONS=(
  ts tsx js jsx
  py
  go
  rs
  java kt
  rb
  cs
  vue svelte
  prisma graphql proto
  yaml yml toml
  Dockerfile
  sql
  txt
)

# --- Archivos de config/doc siempre relevantes ---
CONFIG_FILES=(
  "package.json"
  "tsconfig.json"
  "nest-cli.json"
  "angular.json"
  "next.config.js" "next.config.ts" "next.config.mjs"
  "vite.config.ts" "vite.config.js"
  "docker-compose.yml" "docker-compose.yaml"
  "Dockerfile"
  "Makefile"
  "go.mod"
  "Cargo.toml"
  "pyproject.toml" "requirements.txt"
  "Gemfile"
  ".eslintrc.js" ".eslintrc.json"
  "jest.config.ts" "jest.config.js"
  "vitest.config.ts"
  "README.md"
  "CLAUDE.md"
)

# --- Directorios a ignorar siempre ---
IGNORE_DIRS=(
  node_modules .git dist build .next .nuxt
  __pycache__ .venv venv .tox
  target vendor
  .angular .cache coverage
  .terraform .serverless
)

# --- Parse args ---
FORCE=""
DRY_RUN=""
INCLUDE_PATTERNS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    --domain) DOMAIN="$2"; shift 2 ;;
    --api) API_URL="$2"; shift 2 ;;
    --force) FORCE="true"; shift ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --include) INCLUDE_PATTERNS+=("$2"); shift 2 ;;
    --help|-h) usage ;;
    *)
      if [ -z "$PROJECT_DIR" ]; then
        PROJECT_DIR="$1"
      else
        echo "ERROR: Argumento inesperado: $1"
        usage
      fi
      shift ;;
  esac
done

if [ -z "$PROJECT_DIR" ] || [ -z "$DOMAIN" ]; then
  echo "ERROR: Se requiere directorio y --domain"
  usage
fi

PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"
PROJECT_NAME="$(basename "$PROJECT_DIR")"

if [ -z "$DRY_RUN" ]; then
  if ! curl -sf "$API_URL/health" > /dev/null 2>&1; then
    echo "ERROR: API no disponible en $API_URL"
    echo "Ejecutá: npm run start:dev"
    exit 1
  fi
fi

# --- Construir el find command ---
FIND_EXCLUDES=""
for dir in "${IGNORE_DIRS[@]}"; do
  FIND_EXCLUDES="$FIND_EXCLUDES -path '*/$dir' -prune -o -path '*/$dir/*' -prune -o"
done

build_extension_pattern() {
  local pattern=""
  for ext in "${EXTENSIONS[@]}"; do
    if [ -n "$pattern" ]; then
      pattern="$pattern -o"
    fi
    pattern="$pattern -name '*.$ext'"
  done
  for f in "${CONFIG_FILES[@]}"; do
    pattern="$pattern -o -name '$f'"
  done
  echo "$pattern"
}

echo "============================================"
echo "  Ingesting: $PROJECT_NAME"
echo "  Domain:    $DOMAIN"
echo "  Path:      $PROJECT_DIR"
echo "============================================"
echo ""

# --- Recolectar archivos ---
EXT_PATTERN=$(build_extension_pattern)

FILES=$(eval "find '$PROJECT_DIR' $FIND_EXCLUDES -type f \( $EXT_PATTERN \) -print" 2>/dev/null | sort)

if [ ${#INCLUDE_PATTERNS[@]} -gt 0 ]; then
  FILTERED=""
  for pattern in "${INCLUDE_PATTERNS[@]}"; do
    MATCHED=$(echo "$FILES" | grep -E "$pattern" || true)
    FILTERED="$FILTERED
$MATCHED"
  done
  FILES=$(echo "$FILTERED" | grep -v '^$' | sort -u)
fi

TOTAL=$(echo "$FILES" | grep -c -v '^$' || echo 0)
echo "Archivos encontrados: $TOTAL"
echo ""

if [ "$TOTAL" -eq 0 ]; then
  echo "No se encontraron archivos para ingestar."
  exit 0
fi

SUCCESS=0
SKIPPED=0
ERRORS=0
TOO_LARGE=0

process_file() {
  local filepath="$1"
  local relative="${filepath#$PROJECT_DIR/}"
  local source="${DOMAIN}/${relative}"
  local title="$PROJECT_NAME/$relative"
  local filesize
  filesize=$(wc -c < "$filepath" | tr -d ' ')

  if [ "$filesize" -eq 0 ]; then
    echo "  SKIP (empty): $relative"
    return 2
  fi

  if [ "$filesize" -gt "$MAX_FILE_SIZE" ]; then
    echo "  SKIP (>500KB): $relative"
    return 2
  fi

  local ext="${filepath##*.}"
  local content_type="text/plain"
  case "$ext" in
    md) content_type="text/markdown" ;;
    ts|tsx|js|jsx|py|go|rs|java|kt|rb|cs|vue|svelte) content_type="text/plain" ;;
    yaml|yml|toml|json|graphql|proto|prisma|sql) content_type="text/plain" ;;
  esac

  if [ -n "$DRY_RUN" ]; then
    echo "  WOULD INGEST: $relative ($(numfmt --to=iec "$filesize" 2>/dev/null || echo "${filesize}B"))"
    return 0
  fi

  local force_param=""
  if [ -n "$FORCE" ]; then
    force_param="&force=true"
  fi

  local encoded_title encoded_source
  encoded_title=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$title'))")
  encoded_source=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$source'))")

  local status_code
  local retries=0
  local max_retries=3

  while [ "$retries" -le "$max_retries" ]; do
    status_code=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${API_URL}/ingestion/raw?title=${encoded_title}&source=${encoded_source}&contentType=${content_type}&domain=${DOMAIN}${force_param}" \
      -H "Content-Type: text/plain" \
      --data-binary "@${filepath}" \
      --max-time 60)

    if [ "$status_code" = "201" ] || [ "$status_code" = "200" ]; then
      return 0
    elif [ "$status_code" = "409" ]; then
      return 1
    elif [ "$status_code" = "429" ]; then
      retries=$((retries + 1))
      if [ "$retries" -le "$max_retries" ]; then
        echo -n "THROTTLED, waiting 30s... "
        sleep 30
      fi
    else
      return 3
    fi
  done
  return 3
}

COUNTER=0
for filepath in $FILES; do
  [ -z "$filepath" ] && continue
  COUNTER=$((COUNTER + 1))
  relative="${filepath#$PROJECT_DIR/}"

  if [ -z "$DRY_RUN" ]; then
    printf "[%d/%d] %s... " "$COUNTER" "$TOTAL" "$relative"
  fi

  set +e
  process_file "$filepath"
  result=$?
  set -e

  case $result in
    0) SUCCESS=$((SUCCESS + 1)); [ -z "$DRY_RUN" ] && echo "OK" ;;
    1) SKIPPED=$((SKIPPED + 1)); [ -z "$DRY_RUN" ] && echo "EXISTS (use --force)" ;;
    2) TOO_LARGE=$((TOO_LARGE + 1)) ;;
    3) ERRORS=$((ERRORS + 1)); [ -z "$DRY_RUN" ] && echo "ERROR" ;;
  esac
done

echo ""
echo "============================================"
echo "  Resultado"
echo "============================================"
if [ -n "$DRY_RUN" ]; then
  echo "  Modo:       dry-run (no se ingesto nada)"
fi
echo "  Ingested:   $SUCCESS"
echo "  Skipped:    $SKIPPED (ya existían)"
echo "  Too large:  $TOO_LARGE (>500KB)"
echo "  Errors:     $ERRORS"
echo "  Total:      $TOTAL"
echo ""

if [ -z "$DRY_RUN" ] && [ "$SUCCESS" -gt 0 ]; then
  echo "Listo. Ahora podés consultar con:"
  echo ""
  echo "  curl -X POST $API_URL/ai-architect/query \\"
  echo "    -H 'Content-Type: application/json' \\"
  echo "    -d '{"
  echo "      \"query\": \"Analizá la arquitectura de este proyecto. ¿Qué errores tiene? ¿Qué se puede mejorar?\","
  echo "      \"useHybrid\": true,"
  echo "      \"useMultiQuery\": true,"
  echo "      \"useReranking\": true,"
  echo "      \"domain\": \"$DOMAIN\""
  echo "    }'"
fi
