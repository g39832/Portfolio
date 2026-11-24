#!/bin/bash
# Git lab: a small website repo with some history, a branch that conflicts, and a bad commit.
set -e
cd "$HOME"
git config --global user.name "Learner"
git config --global user.email "learner@sandbox.local"
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global core.editor nano
git init -q repo && cd repo
c() { GIT_AUTHOR_DATE="2026-11-$1T10:00:00" GIT_COMMITTER_DATE="2026-11-$1T10:00:00" git commit -qm "$2"; }
printf '<h1>Homelab</h1>\n<p>Two Pis, one cluster.</p>\n' > index.html; git add .; c 01 "First page"
printf '#!/bin/bash\necho "starting app"\n' > app.sh; git add .; c 02 "Add start script"
printf 'body { font-family: sans-serif; }\n' > style.css; git add .; c 03 "Add styles"
git checkout -q -b feature/footer
printf '<footer>Made by Grayson</footer>\n' >> index.html; git commit -qam "Add footer"
git checkout -q main
printf '<footer>Hosted on Raspberry Pis</footer>\n' >> index.html; git commit -qam "Add hosting note"
printf 'echo "DEBUG: secrets=$(env)"\n' >> app.sh; git commit -qam "Add debug logging"
printf 'GET / 200\n' > server.log
cd ..
printf 'Git lab. The repo is ~/repo. Start with: cd repo && git log --oneline --graph --all\n' > README.txt
mkdir -p answers
