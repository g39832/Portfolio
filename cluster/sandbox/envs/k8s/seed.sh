#!/bin/bash
# Kubernetes lab: empties the playground namespace (the only place this lab can change things).
cd "$HOME"
mkdir -p answers yaml
if kubectl auth can-i delete deployments >/dev/null 2>&1; then
  helm list -q 2>/dev/null | xargs -r helm uninstall >/dev/null 2>&1 || true
  kubectl delete deployments,statefulsets,services,configmaps,jobs,cronjobs,pods,hpa,networkpolicies,ingresses,pvc --all --wait=false >/dev/null 2>&1 || true
fi
cat > yaml/hello-probe.yaml <<'Y'
# A patch that adds a readiness probe to the hello deployment:
#   kubectl patch deployment hello --patch-file yaml/hello-probe.yaml
spec:
  template:
    spec:
      containers:
        - name: nginx-unprivileged
          readinessProbe:
            httpGet: {path: /, port: 8080}
            periodSeconds: 5
Y
printf 'Kubernetes lab. kubectl works on the real cluster: read-only everywhere, full control in "playground".\n' > README.txt
