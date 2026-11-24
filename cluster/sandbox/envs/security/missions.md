# Security
Small, real security habits. Files to look at are in ~/files and ~/project. Answers go in ~/answers/.

## Secrets are only base64
~/files/secret.yaml is a Kubernetes Secret. Decode the password and save it to ~/answers/password.txt. (Anyone who can read a Secret can do this, which is why they never go in Git.)
hint: grep password ~/files/secret.yaml
hint: grep password: ~/files/secret.yaml | awk '{print $2}' | base64 -d > ~/answers/password.txt
check: [ "$(tr -d ' \n' < answers/password.txt)" = "$(grep password: files/secret.yaml | awk '{print $2}' | base64 -d)" ]

## Least privilege, for real
This terminal's kubectl account can read most things. Can it read Secrets in the ledger namespace? Save yes or no to ~/answers/secrets.txt. Then try kubectl get secrets -n ledger and see what happens.
hint: kubectl auth can-i get secrets -n ledger
hint: kubectl auth can-i --list -n ledger | head -20
check: [ "$(tr -d ' \n' < answers/secrets.txt)" = "$(kubectl auth can-i get secrets -n ledger 2>/dev/null)" ]

## Verify a download
Before you run something you downloaded, check its hash against the one the project publishes. Save the SHA-256 of ~/files/release.tar.gz (just the hash) to ~/answers/sha256.txt.
hint: sha256sum ~/files/release.tar.gz
hint: sha256sum ~/files/release.tar.gz | cut -d' ' -f1 > ~/answers/sha256.txt
check: [ "$(tr -d ' \n' < answers/sha256.txt)" = "$(sha256sum files/release.tar.gz | cut -d' ' -f1)" ]

## Find the leaked key
Someone committed a cloud key into ~/project. AWS keys start with AKIA. Find which file has it and save the file name (just the name, like app.env) to ~/answers/leak.txt.
hint: grep -rn AKIA ~/project
check: [ "$(tr -d ' \n' < answers/leak.txt)" = "$(basename "$(grep -rl AKIA project | head -1)")" ]

## Make an SSH key
Make an ed25519 SSH key at ~/.ssh/id_ed25519 with the comment "sandbox" (press Enter for no passphrase, or set one). Look at the .pub file: that's the half you give to servers and GitHub.
hint: ssh-keygen -t ed25519 -C sandbox -f ~/.ssh/id_ed25519
check: [ -f .ssh/id_ed25519 ] && grep -q ' sandbox$' .ssh/id_ed25519.pub

## SSH folder permissions
SSH refuses keys other people can read. Make ~/.ssh 700 and the private key 600.
hint: chmod 700 ~/.ssh && chmod 600 ~/.ssh/id_ed25519 && ls -la ~/.ssh
check: [ "$(stat -c %a .ssh)" = 700 ] && [ "$(stat -c %a .ssh/id_ed25519)" = 600 ]

## A strong random password
Generate a random password with openssl (at least 24 random bytes) and save it to ~/answers/strong.txt.
hint: openssl rand -base64 24 > ~/answers/strong.txt
check: [ "$(tr -d '\n' < answers/strong.txt | wc -c)" -ge 32 ]

## Not root
Containers shouldn't run as root. Save the user ID this terminal runs as to ~/answers/uid.txt, then look at how your real apps are set up: kubectl get pod -n start -o yaml | grep -A5 securityContext.
hint: id -u > ~/answers/uid.txt
check: [ "$(tr -d ' \n' < answers/uid.txt)" = "$(id -u)" ] && [ "$(id -u)" != 0 ]

## Find the watchman
CrowdSec watches your site's logs. Find its pods in the cluster and save how many crowdsec pods are running to ~/answers/crowdsec.txt.
hint: kubectl get pods -A | grep -i crowdsec
hint: kubectl get pods -A --no-headers | grep -ci crowdsec > ~/answers/crowdsec.txt
check: [ "$(tr -d ' \n' < answers/crowdsec.txt)" = "$(kubectl get pods -A --no-headers 2>/dev/null | grep -ci crowdsec)" ]
