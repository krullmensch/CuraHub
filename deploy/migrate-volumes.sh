#!/bin/sh
# One-time move of an installation from Docker volumes into ./data (compose files before
# 2026-10-11 kept the data in the volumes <project>_db_data, _backend_uploads and _secrets).
# Run in the stack directory while the stack is stopped:
#   docker compose down && git pull --ff-only && sh deploy/migrate-volumes.sh [project]
# <project> defaults to the folder name, like docker compose does. The volumes are only read
# and stay as they are; remove them yourself once CuraHub runs from ./data.
set -eu

PROJECT="${1:-$(basename "$PWD" | tr 'A-Z' 'a-z' | tr -cd 'a-z0-9_-')}"

if [ -n "$(docker ps -q --filter "label=com.docker.compose.project=$PROJECT")" ]; then
  echo "Der Stack \"$PROJECT\" läuft noch. Erst: docker compose down" >&2
  exit 1
fi
if ! docker volume inspect "${PROJECT}_db_data" >/dev/null 2>&1; then
  echo "Volume ${PROJECT}_db_data nicht gefunden. Projektname als Argument angeben?" >&2
  exit 1
fi
if [ -d data/db ] && [ -n "$(ls -A data/db 2>/dev/null)" ]; then
  echo "data/db ist nicht leer — hier wurde schon umgezogen. Abbruch." >&2
  exit 1
fi

mkdir -p data/db data/uploads data/secrets data/backups
chmod 700 data/secrets data/backups

copy() { # <volume> <folder in data/>
  if docker volume inspect "${PROJECT}_$1" >/dev/null 2>&1; then
    echo "Kopiere ${PROJECT}_$1 nach data/$2 …"
    docker run --rm -v "${PROJECT}_$1:/from:ro" -v "$PWD/data/$2:/to" alpine:3.20 cp -a /from/. /to/
  else
    echo "Volume ${PROJECT}_$1 fehlt, übersprungen."
  fi
}
copy db_data db
copy backend_uploads uploads
copy secrets secrets

# Databases created before the init service keep the root password from the old .env (or the
# environment); the backup service reads it from data/secrets, so it goes there.
root_pw="${DB_ROOT_PASSWORD:-}"
if [ -z "$root_pw" ] && [ -f .env ]; then
  root_pw="$(grep -E '^DB_ROOT_PASSWORD=' .env | tail -1 | cut -d= -f2- | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/")"
fi
if [ -n "$root_pw" ]; then
  (umask 077; printf '%s' "$root_pw" > data/secrets/db_root_password)
  echo "Root-Passwort (DB_ROOT_PASSWORD) nach data/secrets/db_root_password übernommen."
fi

echo "Fertig. Jetzt: docker compose up -d — und prüfen, ob alle Ausstellungen da sind."
echo "Die alten Volumes bleiben bis: docker volume rm ${PROJECT}_db_data ${PROJECT}_backend_uploads ${PROJECT}_secrets"
