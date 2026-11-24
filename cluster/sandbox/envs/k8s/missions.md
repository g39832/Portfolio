# Kubernetes
kubectl here talks to your real cluster. It can look at everything (except Secrets) but can only change the "playground" namespace, so you can't break your real apps. Try kubectl get pods -A, kubectl get nodes, kubectl top nodes. `k` is short for kubectl and Tab completes.

Playground pods get small CPU and memory limits automatically so they can't starve the Pis, and it holds 20 pods. When it's full, `tidy` deletes everything you made there.

## Look before you touch
How many pods are running in the whole cluster right now? Save the number to ~/answers/pods.txt.
hint: kubectl get pods -A --no-headers | wc -l
hint: kubectl get pods -A --no-headers --field-selector=status.phase=Running | wc -l > ~/answers/pods.txt
check: n=$(tr -d ' \n' < answers/pods.txt); t=$(kubectl get pods -A --no-headers 2>/dev/null | wc -l); [ -n "$n" ] && [ "$n" -ge 1 ] && [ "$n" -le "$t" ]

## Run a deployment
Make a deployment called hello running nginxinc/nginx-unprivileged:1.28-alpine (it listens on port 8080).
hint: kubectl create deployment hello --image=nginxinc/nginx-unprivileged:1.28-alpine --port=8080
hint: kubectl get pods -w   (Ctrl+C to stop watching)
check: [ "$(kubectl get deploy hello -o jsonpath='{.status.readyReplicas}' 2>/dev/null)" -ge 1 ] 2>/dev/null

## Scale it out
Run 3 copies of hello. Then delete one pod and watch Kubernetes replace it.
hint: kubectl scale deployment hello --replicas=3
hint: kubectl delete pod <one of the hello pods> && kubectl get pods
check: [ "$(kubectl get deploy hello -o jsonpath='{.spec.replicas}')" = 3 ]

## Give it a Service
Expose hello as a ClusterIP Service named hello on port 80, sending traffic to the pods' port 8080. Then fetch the page from here with curl and save the page's <title> line to ~/answers/title.txt.
hint: kubectl expose deployment hello --port=80 --target-port=8080
hint: curl -s http://hello.playground.svc.cluster.local | grep -i '<title>' > ~/answers/title.txt
check: kubectl get svc hello >/dev/null 2>&1 && grep -qi 'welcome to nginx' answers/title.txt

## Config from a ConfigMap
Make a ConfigMap called site-config with COLOR=blue, and give it to hello as environment variables.
hint: kubectl create configmap site-config --from-literal=COLOR=blue
hint: kubectl set env deployment/hello --from=configmap/site-config
hint: check: kubectl exec deploy/hello -- env | grep COLOR
check: kubectl get cm site-config -o jsonpath='{.data.COLOR}' | grep -qx blue && kubectl get deploy hello -o yaml | grep -q site-config

## Ship, then undo
Update hello to image nginxinc/nginx-unprivileged:1.29-alpine, watch the rollout, then pretend it's broken and roll back.
hint: kubectl set image deployment/hello nginx-unprivileged=nginxinc/nginx-unprivileged:1.29-alpine
hint: kubectl rollout status deployment/hello && kubectl rollout history deployment/hello
hint: kubectl rollout undo deployment/hello
check: kubectl get deploy hello -o jsonpath='{.spec.template.spec.containers[0].image}' | grep -q '1.28-alpine' && [ "$(kubectl get deploy hello -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}')" -ge 3 ]

## Add a readiness probe
Add a readiness probe so a pod only gets traffic once nginx answers on /. There's a ready-made patch in ~/yaml.
hint: cat ~/yaml/hello-probe.yaml && kubectl patch deployment hello --patch-file ~/yaml/hello-probe.yaml
hint: kubectl describe pod -l app=hello | grep -i readiness
check: kubectl get deploy hello -o jsonpath='{.spec.template.spec.containers[0].readinessProbe.httpGet.port}' | grep -qx 8080

## Set a memory limit
Give hello's container a memory request of 16Mi and limit of 64Mi.
hint: kubectl set resources deployment hello --requests=memory=16Mi --limits=memory=64Mi
check: [ "$(kubectl get deploy hello -o jsonpath='{.spec.template.spec.containers[0].resources.limits.memory}')" = 64Mi ]

## Read the events
Something always goes wrong eventually. Make a pod that can't start: kubectl run broken --image=nginx:does-not-exist. Find the reason in its events and save the pod's waiting reason (one word, like ErrImagePull) to ~/answers/reason.txt.
hint: kubectl run broken --image=nginx:does-not-exist && kubectl get pod broken
hint: kubectl describe pod broken | tail; kubectl get events --sort-by=.lastTimestamp | tail
check: grep -qE 'ErrImagePull|ImagePullBackOff' answers/reason.txt

## A Job that runs once
Run a Job called pi that prints the date and the node it's on, then read its logs.
hint: kubectl create job pi --image=busybox:1.36 -- sh -c 'date; echo done'
hint: kubectl logs job/pi
check: [ "$(kubectl get job pi -o jsonpath='{.status.succeeded}' 2>/dev/null)" = 1 ]

## Who can do what?
Your lab runs as a ServiceAccount. Ask the cluster: can you delete pods in the graysoncodes namespace? Save yes or no to ~/answers/can-delete.txt.
hint: kubectl auth can-i delete pods -n graysoncodes
check: [ "$(tr -d ' \n' < answers/can-delete.txt)" = "$(kubectl auth can-i delete pods -n graysoncodes 2>/dev/null)" ]

## Install with Helm
Helm installs packaged apps from charts. Make your own starter chart and install it into the playground with nginx's unprivileged image (it listens on 8080). Then look at helm list and kubectl get all, and helm uninstall it when you're done.
hint: helm create mychart && helm install demo ./mychart --set image.repository=nginxinc/nginx-unprivileged --set image.tag=1.28-alpine --set service.port=8080
hint: helm list && helm uninstall demo   (when done)
check: helm list -q 2>/dev/null | grep -q .
