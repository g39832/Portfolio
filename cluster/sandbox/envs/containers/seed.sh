#!/bin/bash
# Containers lab: a small Python app with a Dockerfile full of beginner mistakes.
set -e
cd "$HOME"
mkdir -p app answers
cat > app/app.py <<'P'
from http.server import BaseHTTPRequestHandler, HTTPServer

class Hello(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"hello from a container\n")

HTTPServer(("", 8000), Hello).serve_forever()
P
printf 'requests==2.32.3\n' > app/requirements.txt
cat > app/Dockerfile <<'D'
FROM python:latest
RUN apt-get update
RUN apt-get install -y curl
ADD . /app
WORKDIR /app
RUN pip install -r requirements.txt
CMD python app.py
D
printf 'Containers lab. The app and its Dockerfile are in ~/app.\n' > README.txt
