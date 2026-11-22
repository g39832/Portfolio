# Shared proxy settings for the blog paths ($blog_upstream is set in default.conf.template).
proxy_pass $blog_upstream;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto https;
proxy_read_timeout 60s;
proxy_buffering on;
