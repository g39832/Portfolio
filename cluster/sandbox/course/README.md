# DevOps Path: the course

`server.py` serves the course page (`static/`) and its API next to the practice terminals. Content is
`modules/*.yaml`, one module per file, run in file-name order. Restart the pod to pick up changes
(`bash ~/Portfolio/cluster/sandbox/deploy.sh` after CI has built the new image).

## A module file

```yaml
id: k8s                     # short and stable: progress is saved under module/lesson ids
title: Kubernetes
badge: Cluster Pilot        # the badge name you earn for finishing it
lab: k8s                    # which terminal opens next to its lessons (a folder in ../envs/)
summary: One line for the course map.
intro: |                    # optional, Markdown, shown on the module page
  ...
lessons:
  - id: desired
    title: Desired state
    minutes: 20
    teach: |                # Markdown: paragraphs, ### headings, - and 1. lists, > tips, ``` code
      ...                   # lines starting with "$ " in a code block get a Run button
    live:                   # optional "On your cluster, right now" panels
      - title: Everything running
        cmd: kubectl get deploy -A      # read-only! runs as the lab's user when the lesson opens
        note: optional one-liner under the title
        lab: k8s                        # optional, defaults to the module's lab
    sources:                # what the lesson is based on (keep every link free, and check it)
      - title: Kubernetes docs, overview
        url: https://kubernetes.io/docs/concepts/overview/
    quiz:                   # all must be right to pass; misses go to Review
      - q: The question (inline `code` and **bold** work)
        choices: [a, b, c, d]
        answer: 1           # index of the right choice in this list (the page shuffles them)
        why: Shown after answering, right or wrong.
    tasks:
      - mission: Run a deployment       # reuse a mission from envs/<lab>/missions.md by its title
      - title: Your own task            # or write one here
        text: Markdown. What to do and where to save answers.
        hints: [first hint, second hint]
        check: bash that exits 0 when it's done (runs in the lab's home folder)
        lab: k8s                        # optional, defaults to the module's lab
```

A lesson is done when it's been read, its quiz is passed and every task's check has passed once.
Lessons open one at a time unless "Open every lesson" is on (Home → Settings).

## Rules for content

- Every task needs a check that really looks at the work. Live panels and checks must only read the
  cluster: the learner account can't change anything outside `playground` anyway.
- Keep sources free and on topic, and curl-check them when adding.
- Quick test, from this folder: `SANDBOX=.. python -c "import runpy; print(runpy.run_path('server.py')['PROBLEMS'])"`
  prints problems like a mission title that doesn't exist or an answer out of range (`[]` is good).

## Progress

`/work/.course/progress.json` on the labs' volume: per-lesson read/quiz/tasks, an event log (XP,
streaks, the activity map) and the Review queue. Delete it to start the course over. Missions already
passed with `learn` in a terminal are counted the first time the course starts.
