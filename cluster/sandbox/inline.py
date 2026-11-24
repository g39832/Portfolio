"""Bakes xterm.js into the terminal page: inline.py terminal.html xterm.css xterm.js fit.js > index.html"""
import sys

page, css, js, fit = (open(p, encoding="utf-8").read() for p in sys.argv[1:5])
safe = lambda s: s.replace("</script", "<\/script")
page = page.replace("/*XTERM_CSS*/", css).replace("/*XTERM_JS*/", safe(js)).replace("/*FIT_JS*/", safe(fit))
sys.stdout.write(page)
