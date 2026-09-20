#!/bin/sh
set -eu

data_dir="${DATA_DIR:-/data}"

# A bind mount hides the /data directory created in the image, so its owner
# can differ from the non-root runtime user. Repair it before dropping
# privileges, then exec the requested process as nextjs.
if [ "$(id -u)" -eq 0 ]; then
  mkdir -p "$data_dir/logos"
  chown -R nextjs:nodejs "$data_dir"
  exec gosu nextjs "$@"
fi

echo "docker-entrypoint: running as $(id -un); skipping /data ownership repair" >&2
exec "$@"
