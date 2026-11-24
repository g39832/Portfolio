# Git & GitHub
~/repo is a small website with a bit of history. Start with `cd repo` and `git log --oneline --graph --all` to see it. Answers go in ~/answers/. For a visual feel, play learngitbranching.js.org on your phone too.

## Count the commits
How many commits are on main? Save the number to ~/answers/commits.txt.
hint: git -C ~/repo rev-list --count main
hint: git -C ~/repo rev-list --count main > ~/answers/commits.txt
check: [ "$(tr -d ' \n' < answers/commits.txt)" = "$(git -C repo rev-list --count main)" ] || [ "$(tr -d ' \n' < answers/commits.txt)" = 5 ]

## Ignore the logs
server.log keeps showing up in git status. Make Git ignore every .log file with a .gitignore, and commit the .gitignore.
hint: cd ~/repo && echo '*.log' > .gitignore && git add .gitignore && git commit -m "Ignore logs"
check: git -C repo check-ignore -q server.log && git -C repo ls-files --error-unmatch .gitignore >/dev/null 2>&1

## Undo a bad commit safely
"Add debug logging" prints every secret in the environment. Undo it with git revert (which adds a new commit) instead of rewriting history.
hint: git log --oneline, find the commit, then git revert <id> (save and close the message in nano: Ctrl+O, Enter, Ctrl+X)
check: ! grep -q DEBUG repo/app.sh && git -C repo log main --format=%s | grep -q '^Add debug logging' && git -C repo log main --format=%s | grep -q '^Revert'

## Merge and fix a conflict
Merge feature/footer into main. Both branches changed the footer, so Git will stop and ask you. Keep both footer lines, remove the <<<<<<< ======= >>>>>>> markers, then add and commit.
hint: git checkout main && git merge feature/footer
hint: nano index.html (delete the marker lines, keep both footers), then git add index.html && git commit --no-edit
check: git -C repo merge-base --is-ancestor feature/footer main && ! grep -qE '^(<<<<<<<|=======|>>>>>>>)' repo/index.html && grep -q 'Made by Grayson' repo/index.html && grep -q 'Raspberry Pis' repo/index.html

## Work on a branch
Make a branch feature/about, add about.html on it and commit. main shouldn't have the file.
hint: git switch -c feature/about && echo '<h1>About</h1>' > about.html && git add about.html && git commit -m "Add about page"
check: git -C repo cat-file -e feature/about:about.html 2>/dev/null && ! git -C repo cat-file -e main:about.html 2>/dev/null

## Tag a release
Tag the current main as v1.0.0 with an annotated tag (-a, with a message).
hint: git switch main && git tag -a v1.0.0 -m "First release"
check: [ "$(git -C repo cat-file -t v1.0.0 2>/dev/null)" = tag ] && [ "$(git -C repo rev-parse 'v1.0.0^{commit}')" = "$(git -C repo rev-parse main)" ]

## Stash unfinished work
Change style.css (any edit), then stash it so the working tree is clean. Leave it in the stash.
hint: echo 'h1 { color: navy; }' >> style.css && git stash push -m "colour idea" && git stash list
check: [ -n "$(git -C repo stash list)" ] && [ -z "$(git -C repo status --porcelain --untracked-files=no)" ]

## Find who changed a line
Use git blame on app.sh. Who wrote the line that echoes "starting app"? Save the author name to ~/answers/blame.txt.
hint: git blame app.sh
check: grep -qi '^learner$' answers/blame.txt

## Log in to GitHub (optional)
The gh tool talks to GitHub. Run gh auth login, choose GitHub.com, HTTPS and "Login with a web browser": it shows a code to enter at github.com/login/device on your phone. Then try gh repo view g39832/Portfolio and gh run list -R g39832/Portfolio.
hint: gh auth login
check: gh auth status >/dev/null 2>&1
