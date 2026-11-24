# CI/CD & YAML
CI is mostly YAML that runs commands for you. ~/workflows has a broken GitHub Actions workflow, ~/data has JSON and YAML to query, and ~/real/cluster-images.yml is the workflow that builds your cluster's images. Answers go in ~/answers/.

## Read the real workflow
Open ~/real/cluster-images.yml. Which platform does it build images for? Save it (like linux/amd64) to ~/answers/platform.txt.
hint: grep -n platforms ~/real/cluster-images.yml
check: [ "$(tr -d ' \n' < answers/platform.txt)" = linux/arm64 ]

## Fix the broken workflow
Run actionlint on ~/workflows/broken.yml and fix every problem it reports (a typo'd key, a typo'd runner, an unsafe use of the commit message, and a number that should be a string).
hint: actionlint ~/workflows/broken.yml
hint: branches not branch; ubuntu-latest; put the message in env: MSG: ${{ github.event.head_commit.message }} and use "$MSG"; python-version: "3.10"
check: actionlint workflows/broken.yml

## Write a workflow
Write ~/workflows/lint.yml: run on push and pull_request, one job on ubuntu-latest that checks out the code and runs shellcheck scripts/*.sh. It must pass actionlint.
hint: on: [push, pull_request]  /  jobs: lint: runs-on: ubuntu-latest  /  steps: - uses: actions/checkout@v4  - run: shellcheck scripts/*.sh
check: actionlint workflows/lint.yml && grep -q pull_request workflows/lint.yml && grep -q shellcheck workflows/lint.yml

## Query JSON with jq
From ~/data/services.json, save the names of the public services to ~/answers/public.txt, one per line.
hint: jq -r '.services[] | select(.public) | .name' ~/data/services.json > ~/answers/public.txt
check: diff -q <(jq -r '.services[] | select(.public) | .name' data/services.json) answers/public.txt

## Edit YAML with yq
Change replicas in ~/data/app.yaml to 3 with yq (not by hand), keeping the rest of the file.
hint: yq -y -i '.spec.replicas = 3' ~/data/app.yaml
check: [ "$(yq -r .spec.replicas data/app.yaml)" = 3 ] && [ "$(yq -r .metadata.name data/app.yaml)" = demo ]

## Newest version
~/data/versions.txt is a list of versions. Which is the newest stable (no -rc) one? Save it to ~/answers/newest.txt. Note that 1.10.0 is newer than 1.9.7, which plain sort gets wrong.
hint: grep -v -- - ~/data/versions.txt | sort -V | tail -1
check: [ "$(tr -d ' \n' < answers/newest.txt)" = 1.10.1 ]

## Read a real run
Use gh to see your Portfolio repo's recent workflow runs (log in first with gh auth login if it asks). Save the name of the workflow that builds the cluster images to ~/answers/workflow.txt.
hint: gh run list -R g39832/Portfolio --limit 5
check: grep -qix 'cluster images' answers/workflow.txt
