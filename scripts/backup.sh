#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="$(cd "$(dirname "$0")/.." && pwd)/backups"
CONTAINER="ai_sdlc_postgres"
DB_USER="user"
DB_NAME="ai_sdlc"
TMP_DUMP="$BACKUP_DIR/.tmp_backup.dump"

mkdir -p "$BACKUP_DIR"

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: Container '$CONTAINER' no está corriendo."
  echo "Ejecutá: docker-compose up -d"
  exit 1
fi

echo "Generando dump temporal..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --format=custom > "$TMP_DUMP"

LATEST=$(ls -t "$BACKUP_DIR"/ai_sdlc_*.dump 2>/dev/null | head -1)

if [ -n "$LATEST" ]; then
  if cmp -s "$TMP_DUMP" "$LATEST"; then
    echo "Sin cambios desde el último backup: $(basename "$LATEST")"
    rm "$TMP_DUMP"
    exit 0
  fi
  OLD_SIZE=$(wc -c < "$LATEST" | tr -d ' ')
  NEW_SIZE=$(wc -c < "$TMP_DUMP" | tr -d ' ')
  echo "Cambios detectados:"
  echo "  Anterior: $(basename "$LATEST") (${OLD_SIZE} bytes)"
  echo "  Nuevo:    ${NEW_SIZE} bytes"
fi

FINAL="$BACKUP_DIR/ai_sdlc_$(date +%Y%m%d_%H%M%S).dump"
mv "$TMP_DUMP" "$FINAL"
echo "Backup guardado: $(basename "$FINAL")"

COUNT=$(ls "$BACKUP_DIR"/ai_sdlc_*.dump 2>/dev/null | wc -l | tr -d ' ')
if [ "$COUNT" -gt 5 ]; then
  echo "Limpiando backups antiguos (manteniendo los 5 más recientes)..."
  ls -t "$BACKUP_DIR"/ai_sdlc_*.dump | tail -n +6 | xargs rm -f
fi

echo "Total backups: $(ls "$BACKUP_DIR"/ai_sdlc_*.dump | wc -l | tr -d ' ')"
