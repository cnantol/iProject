#!/usr/bin/env bash
# Atlas Copco 订单管理系统 - 每日自动备份脚本
# 建议 cron：0 2 * * * /path/to/atlas-copco/deploy/scripts/backup.sh
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA_DIR="$PROJECT_DIR/server/db/data"
DB_FILE="$DATA_DIR/database.sqlite"
UPLOADS_DIR="$DATA_DIR/uploads"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups}"

TODAY="$(date +%Y%m%d)"
BACKUP_DIR="$BACKUP_ROOT/$TODAY"
mkdir -p "$BACKUP_DIR"

if [ -f "$DB_FILE" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_FILE" "PRAGMA wal_checkpoint(FULL);"
    sqlite3 "$DB_FILE" ".backup '$BACKUP_DIR/database.sqlite'"
  else
    cp "$DB_FILE" "$BACKUP_DIR/database.sqlite"
  fi
fi

if [ -d "$UPLOADS_DIR" ]; then
  cp -R "$UPLOADS_DIR" "$BACKUP_DIR/uploads"
fi

cp -R "$PROJECT_DIR/deploy" "$BACKUP_DIR/deploy" 2>/dev/null || true

cd "$BACKUP_ROOT"
tar -czf "atlas-copco-$TODAY.tar.gz" "$TODAY"
rm -rf "$TODAY"

# 保留最近 30 天备份
find "$BACKUP_ROOT" -name 'atlas-copco-*.tar.gz' -mtime +30 -delete

echo "backup completed: $BACKUP_ROOT/atlas-copco-$TODAY.tar.gz"
