# The public website: the React portfolio (with TumorSim) served by nginx.
# nginx also forwards /blog, /admin/blog, /media and /sitemap.xml to the blog service.
# Build from the repo root:  docker build -f cluster/web.Dockerfile -t portfolio-web .
FROM node:24-alpine AS build
WORKDIR /src
COPY my-react-app/package.json my-react-app/package-lock.json ./
# npm install (not npm ci): the lock file lacks a few Linux-only optional packages.
RUN npm install --no-audit --no-fund
COPY my-react-app/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.28-alpine
COPY cluster/nginx/default.conf.template /etc/nginx/templates/
COPY cluster/nginx/blog-proxy.inc /etc/nginx/conf.d/
# The blog's address inside the cluster. For a local docker test: -e BLOG_UPSTREAM=http://blog:5080
# Campaign Ledger's address, for dnd.graysoncodes.org.
ENV BLOG_UPSTREAM=http://blog.graysoncodes.svc.cluster.local:5080 \
    LEDGER_UPSTREAM=http://ledger.ledger.svc.cluster.local:5050 \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
