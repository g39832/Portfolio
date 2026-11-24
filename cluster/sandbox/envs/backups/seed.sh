#!/bin/bash
# Backups lab: an app's data (files + a SQLite database) and an old restic backup with a file
# that has since been lost.
set -e
cd "$HOME"
mkdir -p data/files answers
openssl rand -base64 24 > .restic-pass
chmod 600 .restic-pass
export RESTIC_PASSWORD_FILE="$HOME/.restic-pass"
for n in 1 2 3; do printf 'session %s notes\n' "$n" > "data/files/session-$n.md"; done
printf 'The dragon is in the cellar. Do not lose this.\n' > data/files/lost.txt
sqlite3 data/app.db "CREATE TABLE notes(id INTEGER PRIMARY KEY, body TEXT);
  INSERT INTO notes(body) VALUES ('first'),('second'),('third'),('fourth'),('fifth'),('sixth'),('seventh');"
restic -r old-backups init -q >/dev/null
restic -r old-backups backup -q --tag nightly data >/dev/null
sha256sum data/files/lost.txt | cut -d' ' -f1 > .lost.sha
rm data/files/lost.txt
printf 'Backups lab. Your data is in ~/data. An old backup repo is in ~/old-backups.\n' > README.txt
