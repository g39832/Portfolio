# The blog (Flask + SQLite, served by Waitress on port 5080).
# Its database and pictures live in /data, which the cluster keeps on a saved disk.
# Build from the repo root:  docker build -f cluster/blog.Dockerfile -t portfolio-blog .
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY blog/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY blog/blogapp ./blogapp
COPY blog/manage.sh ./
RUN useradd --uid 10001 --user-group --no-create-home blog \
 && mkdir -p /data && chown blog:blog /data
USER 10001
ENV BLOG_DATA_DIR=/data/blog BLOG_BACKUP_DIR=/data/backups BLOG_HOST=0.0.0.0 BLOG_PORT=5080
EXPOSE 5080
CMD ["python", "-m", "blogapp", "serve"]
