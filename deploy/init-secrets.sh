#!/bin/sh
# Runs as the compose `init` service before the database starts: creates the folders in ./data
# and the random secrets on the very first start, and never touches existing ones.
set -eu
umask 077
mkdir -p /data/db /data/uploads /data/secrets /data/backups
# Passwords and dumps are readable by root only (the stack directory's backup still sees them).
chmod 700 /data/secrets /data/backups
for name in db_root_password db_password jwt_secret; do
  file="/data/secrets/$name"
  if [ ! -s "$file" ]; then
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$file"
    echo "[init] $name erzeugt"
  fi
  chmod 600 "$file"
done
