#!/bin/sh
# Runs as the compose `init` service before the database starts: creates the random secrets
# on the very first start and never touches existing ones.
set -eu
umask 077
for name in db_root_password db_password jwt_secret; do
  file="/secrets/$name"
  if [ ! -s "$file" ]; then
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$file"
    echo "[init] $name erzeugt"
  fi
  chmod 600 "$file"
done
