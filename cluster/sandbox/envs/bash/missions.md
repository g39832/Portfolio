# Bash scripting
Scripts are in ~/scripts and data in ~/data. Edit files with nano (Ctrl+O saves, Ctrl+X quits; use the Ctrl key on the bar on a phone). Run a script with bash scripts/name.sh.

## Make shellcheck happy
shellcheck finds bugs in shell scripts before they bite. Run it on scripts/broken.sh and fix the script until shellcheck prints nothing. Most fixes are adding "quotes" around variables.
hint: shellcheck scripts/broken.sh
hint: quote "$src" and "$dest", use $(...) not backticks, loop with: for f in "$src"/*; do cp "$f" "$dest"; done
hint: compare with [ "$dest" = "" ] or [ -z "$dest" ]
check: shellcheck scripts/broken.sh

## Bash strict mode
scripts/deploy.sh keeps going after cd fails. Add `set -euo pipefail` as the second line so it stops at the first error. Run it before and after to see the difference.
hint: nano scripts/deploy.sh, add the line under #!/bin/bash, then bash scripts/deploy.sh; echo "exit code $?"
check: sed -n 2,4p scripts/deploy.sh | grep -q 'set -euo pipefail' && ! bash scripts/deploy.sh >/dev/null 2>&1

## Loop over a file
Write scripts/each.sh that reads data/servers.txt and prints "checking <name>" for every line (checking web, checking blog...).
hint: while read -r name; do echo "checking $name"; done < data/servers.txt
check: [ "$(cd ~ && bash scripts/each.sh)" = "$(sed 's/^/checking /' data/servers.txt)" ]

## Arguments and usage
Write scripts/greet.sh: `bash scripts/greet.sh Grayson` prints "Hi, Grayson". With no argument it prints a usage line to stderr (>&2) and exits with code 1.
hint: if [ $# -lt 1 ]; then echo "usage: greet.sh NAME" >&2; exit 1; fi
hint: echo "Hi, $1"
check: [ "$(bash scripts/greet.sh Grayson 2>/dev/null)" = "Hi, Grayson" ] && ! bash scripts/greet.sh >/dev/null 2>&1 && [ -z "$(bash scripts/greet.sh 2>/dev/null)" ]

## Defaults from the environment
Write scripts/env.sh that prints "env=<value of APP_ENV>", using "dev" when APP_ENV isn't set. So `APP_ENV=prod bash scripts/env.sh` prints env=prod.
hint: echo "env=${APP_ENV:-dev}"
check: [ "$(env -u APP_ENV bash scripts/env.sh)" = "env=dev" ] && [ "$(APP_ENV=prod bash scripts/env.sh)" = "env=prod" ]

## Exit codes mean something
Write scripts/ready.sh that exits 0 if the file data/ready exists and 3 if it doesn't. Test with `bash scripts/ready.sh; echo $?`.
hint: [ -f data/ready ] && exit 0 || exit 3    (run it from ~, or use "$HOME/data/ready")
check: rm -f data/ready; bash scripts/ready.sh; a=$?; touch data/ready; bash scripts/ready.sh; b=$?; rm -f data/ready; [ $a = 3 ] && [ $b = 0 ]

## Clean up after yourself
Write scripts/tmp.sh that makes a temp file with mktemp, prints its path, and uses `trap 'rm -f "$tmp"' EXIT` so the file is gone when the script ends, even on errors.
hint: tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT; echo "$tmp"
check: p=$(bash scripts/tmp.sh) && [ -n "$p" ] && [ ! -e "$p" ] && grep -q trap scripts/tmp.sh
