# Practice terminals: one web terminal (ttyd) with a lab for each learning topic
# (Linux, Bash, Git & GitHub, Kubernetes, Networking, Containers, Security, Backups, CI/CD, IaC)
# plus an SSH jump to the real Pis. The page is cluster/sandbox/terminal.html, which has a key bar
# for phones. Build from the repo root:  docker build -f cluster/sandbox.Dockerfile -t portfolio-sandbox .
FROM debian:trixie-slim

ARG TARGETARCH
ARG TTYD_VERSION=1.7.7
ARG KUBECTL_VERSION=v1.37.2
ARG HELM_VERSION=v4.3.2
ARG HADOLINT_VERSION=v2.15.1
ARG ACTIONLINT_VERSION=1.7.12
ARG TOFU_VERSION=1.13.10
ARG XTERM_VERSION=6.0.0
ARG XTERM_FIT_VERSION=0.11.0

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl wget less nano vim-tiny tmux bash-completion locales tzdata \
      git gh openssh-client procps psmisc tree file unzip xz-utils bc man-db \
      iproute2 iputils-ping dnsutils netcat-openbsd traceroute openssl \
      python3 python3-yaml jq yq shellcheck sqlite3 restic skopeo ansible-core nginx \
    && sed -i 's/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen && locale-gen \
    && rm -rf /var/lib/apt/lists/*

# Single-binary tools, for whichever CPU this is built for (arm64 on the Pis, amd64 for local tests).
RUN set -eux; \
    case "$TARGETARCH" in arm64) t=aarch64; h=arm64 ;; amd64) t=x86_64; h=x86_64 ;; *) exit 1 ;; esac; \
    curl -fsSL -o /usr/local/bin/ttyd "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.$t"; \
    curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl"; \
    curl -fsSL -o /usr/local/bin/hadolint "https://github.com/hadolint/hadolint/releases/download/${HADOLINT_VERSION}/hadolint-linux-$h"; \
    curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" | tar -xz -C /usr/local/bin --strip-components=1 "linux-${TARGETARCH}/helm"; \
    curl -fsSL "https://github.com/rhysd/actionlint/releases/download/v${ACTIONLINT_VERSION}/actionlint_${ACTIONLINT_VERSION}_linux_${TARGETARCH}.tar.gz" | tar -xz -C /usr/local/bin actionlint; \
    curl -fsSL "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_linux_${TARGETARCH}.tar.gz" | tar -xz -C /usr/local/bin tofu; \
    chmod +x /usr/local/bin/*; \
    kubectl completion bash > /etc/bash_completion.d/kubectl; \
    helm completion bash > /etc/bash_completion.d/helm

COPY cluster/sandbox/ /opt/sandbox/

# The terminal page, with xterm.js baked in so it works without a CDN.
RUN set -eux; cd /tmp; \
    curl -fsSL -o xterm.js  "https://cdn.jsdelivr.net/npm/@xterm/xterm@${XTERM_VERSION}/lib/xterm.js"; \
    curl -fsSL -o xterm.css "https://cdn.jsdelivr.net/npm/@xterm/xterm@${XTERM_VERSION}/css/xterm.css"; \
    curl -fsSL -o fit.js    "https://cdn.jsdelivr.net/npm/@xterm/addon-fit@${XTERM_FIT_VERSION}/lib/addon-fit.js"; \
    python3 /opt/sandbox/inline.py /opt/sandbox/terminal.html xterm.css xterm.js fit.js > /opt/sandbox/index.html; \
    rm -f xterm.js xterm.css fit.js; \
    chmod +x /opt/sandbox/enter.sh /opt/sandbox/start.sh /opt/sandbox/learn /opt/sandbox/envs/*/seed.sh; \
    ln -s /opt/sandbox/learn /usr/local/bin/learn; \
    useradd -u 1000 -m -s /bin/bash learner; mkdir -p /work && chown 1000:1000 /work

ENV LANG=en_US.UTF-8 TERM=xterm-256color
USER 1000
WORKDIR /work
EXPOSE 7681
# start.sh runs ttyd (-W writable, -a so the page picks a lab with ?arg=git, -I our page) on a
# private socket, and nginx on :7681 in front of it for the login. The login comes from
# $TTYD_CREDENTIAL (user:password), set from a Kubernetes secret.
CMD ["/opt/sandbox/start.sh"]
