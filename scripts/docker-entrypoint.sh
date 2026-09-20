#!/bin/sh
set -eu

data_dir="${DATA_DIR:-/data}"
runtime_uid="${PUID:-1001}"
runtime_gid="${PGID:-1001}"

# A bind mount hides the /data directory created in the image, so its owner
# can differ from the non-root runtime user. Repair it before dropping
# privileges, then exec the requested process as the configured UID/GID.
if [ "$(id -u)" -eq 0 ]; then
  mkdir -p "$data_dir/logos"
  chown -R "$runtime_uid:$runtime_gid" "$data_dir"
  exec gosu "$runtime_uid:$runtime_gid" "$@"
fi

echo "docker-entrypoint: running as $(id -un); skipping /data ownership repair" >&2
exec "$@"
