#!/bin/bash
# Runs as the compose `backup` service (mariadb image): dumps every CuraHub database into
# /backups (= ./data/backups) once a day and deletes dumps older than 14 days.
# On demand: `docker compose exec backup bash /db-backup.sh now`.
set -uo pipefail
umask 077

DIR=/backups
INTERVAL_MIN=$((24 * 60))
KEEP_DAYS=14
ERROR_FILE="$DIR/.last-error"

MYSQL_PWD="$(cat /run/curahub-secrets/db_root_password 2>/dev/null)" || true
export MYSQL_PWD

dump() {
  local ts tmp out dbs
  ts="$(date -u +%Y%m%d-%H%M%S)"
  out="$DIR/curahub-$ts.sql.gz"
  tmp="$DIR/.curahub-$ts.sql.gz.part"
  # Every database except MariaDB's own, so restoring never touches users or system tables.
  if ! dbs="$(mariadb -h db -uroot -N -e 'SHOW DATABASES' 2>&1 | grep -vxE 'information_schema|performance_schema|mysql|sys')"; then
    echo "$(date -u +%FT%TZ) Datenbanken nicht lesbar: $dbs" | tee "$ERROR_FILE" >&2
    return 1
  fi
  # shellcheck disable=SC2086 # one word per database name
  if mariadb-dump -h db -uroot --single-transaction --routines --events --databases $dbs 2>"$tmp.log" | gzip > "$tmp"; then
    mv "$tmp" "$out"
    rm -f "$tmp.log" "$ERROR_FILE"
    find "$DIR" -maxdepth 1 -name 'curahub-*.sql.gz' -mtime +$((KEEP_DAYS - 1)) -delete
    echo "$(date -u +%FT%TZ) Dump geschrieben: $(basename "$out") ($(du -h "$out" | cut -f1))"
  else
    echo "$(date -u +%FT%TZ) Dump fehlgeschlagen: $(head -c 500 "$tmp.log")" | tee "$ERROR_FILE" >&2
    rm -f "$tmp" "$tmp.log"
    return 1
  fi
}

if [ "${1:-}" = now ]; then
  dump
  exit $?
fi

trap 'exit 0' TERM INT
while true; do
  # A dump on start unless one is younger than a day, so restarts don't skip or pile up dumps.
  if [ -z "$(find "$DIR" -maxdepth 1 -name 'curahub-*.sql.gz' -mmin -"$INTERVAL_MIN" | head -1)" ]; then
    dump
  fi
  sleep 3600 & wait $!
done
