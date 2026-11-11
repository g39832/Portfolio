#!/usr/bin/env bash
# Run a blog maintenance command on the Pi with the production settings loaded.
#   ./manage.sh check
#   ./manage.sh create-admin
#   ./manage.sh set-password --username grayson
#   ./manage.sh backup
#   ./manage.sh restore /home/grayson/blog-backups/blog-backup-....tar.gz --yes
set -euo pipefail
cd "$(dirname "$0")"
if [ -f /etc/graysoncodes-blog.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/graysoncodes-blog.env
  set +a
fi
exec .venv/bin/python -m blogapp "$@"
