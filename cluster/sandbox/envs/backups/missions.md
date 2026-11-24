# Backups
~/data is an app's data: some files and a SQLite database. ~/old-backups is an older restic backup. The restic password is already in $RESTIC_PASSWORD_FILE, so restic won't ask for it. This is the same tool your nightly B2 backups use.

## Look at an old backup
List the snapshots in ~/old-backups, then list the files in the latest one. How many files are in data/files in that snapshot? Save the number to ~/answers/old-files.txt.
hint: restic -r ~/old-backups snapshots
hint: restic -r ~/old-backups ls latest
check: [ "$(tr -d ' \n' < answers/old-files.txt)" = "$(RESTIC_PASSWORD_FILE=.restic-pass restic -r old-backups ls latest 2>/dev/null | grep -c '^/.*/data/files/.')" ] || [ "$(tr -d ' \n' < answers/old-files.txt)" = 4 ]

## Restore a lost file
data/files/lost.txt was deleted after that backup. Restore just that file from ~/old-backups back into ~/data/files.
hint: restic -r ~/old-backups restore latest --target /tmp/r --include lost.txt && find /tmp/r -name lost.txt
hint: cp /tmp/r/*/data/files/lost.txt ~/data/files/   (the path inside shows where it was backed up from)
check: [ -f data/files/lost.txt ] && [ "$(sha256sum data/files/lost.txt | cut -d' ' -f1)" = "$(cat .lost.sha)" ]

## Copy a live database safely
Copying a SQLite file while an app writes to it can give you a broken copy. Use SQLite's own backup command to make ~/data/app-copy.db, then check it.
hint: sqlite3 ~/data/app.db ".backup $HOME/data/app-copy.db"
hint: sqlite3 ~/data/app-copy.db "PRAGMA integrity_check; SELECT count(*) FROM notes;"
check: [ "$(sqlite3 data/app-copy.db 'PRAGMA integrity_check;')" = ok ] && [ "$(sqlite3 data/app-copy.db 'select count(*) from notes')" = "$(sqlite3 data/app.db 'select count(*) from notes')" ]

## Make your own backup repo
Make a new restic repository at ~/backup-repo.
hint: restic -r ~/backup-repo init
check: RESTIC_PASSWORD_FILE=.restic-pass restic -r backup-repo cat config >/dev/null 2>&1

## Back up three times
Back up ~/data into ~/backup-repo three times, changing a file between each one (echo more >> ~/data/files/session-1.md). restic only stores what changed.
hint: restic -r ~/backup-repo backup ~/data
hint: restic -r ~/backup-repo snapshots
check: [ "$(RESTIC_PASSWORD_FILE=.restic-pass restic -r backup-repo snapshots --json 2>/dev/null | jq length)" -ge 2 ] 2>/dev/null

## Keep only what you need
Apply a retention policy: keep the last 2 snapshots, delete the rest, and prune the data they used.
hint: restic -r ~/backup-repo forget --keep-last 2 --prune
check: [ "$(RESTIC_PASSWORD_FILE=.restic-pass restic -r backup-repo snapshots --json 2>/dev/null | jq length)" = 2 ]

## Trust, but verify
A backup you never checked isn't a backup. Run restic check on ~/backup-repo, then compare a file in the latest snapshot with the one on disk.
hint: restic -r ~/backup-repo check
hint: restic -r ~/backup-repo dump latest $HOME/data/files/session-2.md
check: RESTIC_PASSWORD_FILE=.restic-pass restic -r backup-repo check >/dev/null 2>&1

## How many notes?
Count the rows in the notes table of ~/data/app.db and save the number to ~/answers/notes.txt.
hint: sqlite3 ~/data/app.db 'SELECT count(*) FROM notes;'
check: [ "$(tr -d ' \n' < answers/notes.txt)" = "$(sqlite3 data/app.db 'select count(*) from notes')" ]
