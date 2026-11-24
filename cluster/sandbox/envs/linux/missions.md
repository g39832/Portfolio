# Linux & the shell
Your home here is a pretend web server: logs in practice/logs, config in practice/etc, a key in practice/secret.key. Look around with ls, cd, cat, less and tree. Answers go in ~/answers/.

Tip: `cmd > file` saves a command's output to a file, `|` sends it into the next command.

## Make a folder for your projects
Make the folder ~/projects/homelab (both levels at once).
hint: mkdir -p ~/projects/homelab
check: test -d ~/projects/homelab

## Count the 404s
How many requests in practice/logs/access.log got a 404 (not found)? Save just the number to answers/404s.txt.
hint: grep -c '" 404 ' practice/logs/access.log
hint: grep -c '" 404 ' practice/logs/access.log > answers/404s.txt
check: [ "$(tr -d ' \n' < answers/404s.txt)" = "$(grep -c '" 404 ' practice/logs/access.log)" ]

## Who visits the most?
Find the IP address that made the most requests and save it to answers/top-ip.txt. The IP is the first word of each line.
hint: awk '{print $1}' practice/logs/access.log | sort | uniq -c | sort -rn | head -3
hint: then write it: echo 203.0.113.x > answers/top-ip.txt
check: [ "$(tr -d ' \n' < answers/top-ip.txt)" = "$(awk '{print $1}' practice/logs/access.log | sort | uniq -c | sort -rn | awk 'NR==1{print $2}')" ]

## Who's probing for secrets?
Bots try URLs like /.env and /wp-login.php. Save the unique IPs that asked for /.env to answers/env-probers.txt, one per line, sorted.
hint: grep '"GET /.env ' practice/logs/access.log | awk '{print $1}' | sort -u > answers/env-probers.txt
check: diff -q <(grep '"GET /.env ' practice/logs/access.log | awk '{print $1}' | sort -u) answers/env-probers.txt

## Lock down the key
practice/secret.key can be read by everyone (644). Make it readable and writable only by you (600).
hint: ls -l practice/secret.key, then chmod 600 practice/secret.key
check: [ "$(stat -c %a practice/secret.key)" = 600 ]

## Find every .conf file
Save the paths of every file ending in .conf under practice/etc to answers/confs.txt, one per line.
hint: find practice/etc -name '*.conf' > answers/confs.txt
check: [ "$(sort answers/confs.txt | sed 's|^\./||' | xargs -n1 basename 2>/dev/null | sort | tr '\n' ' ')" = "$(find practice/etc -name '*.conf' -printf '%f\n' | sort | tr '\n' ' ')" ]

## Your first command
Make ~/bin/hello: a script that prints exactly "hello homelab". Make it executable so typing hello runs it (~/bin is on your PATH).
hint: mkdir -p ~/bin && printf '#!/bin/bash\necho "hello homelab"\n' > ~/bin/hello
hint: chmod +x ~/bin/hello && hello
check: [ -x bin/hello ] && [ "$(bin/hello)" = "hello homelab" ]

## A shortcut to the log
Make ~/latest.log a symbolic link that points to practice/logs/access.log.
hint: ln -s ~/practice/logs/access.log ~/latest.log && ls -l ~/latest.log
check: [ -L latest.log ] && [ "$(readlink -f latest.log)" = "$(readlink -f practice/logs/access.log)" ]

## Read the load average
The kernel keeps the load average in /proc/loadavg. Save the 1-minute number (the first one) to answers/load.txt. Then compare it with `nproc`: load above the CPU count means work is waiting.
hint: cut -d' ' -f1 /proc/loadavg > answers/load.txt
check: grep -Eqx '[0-9]+\.[0-9]+' answers/load.txt

## Who am I, where am I?
Write your user name to answers/me.txt. (Bonus: run `id` and `ps aux` and see how few processes a container has.)
hint: whoami > answers/me.txt
check: [ "$(tr -d ' \n' < answers/me.txt)" = "$(whoami)" ]
