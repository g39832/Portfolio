# Networking
Tools here: dig, curl, openssl, ip, ss, ping, traceroute and nc. This terminal runs inside a pod on the Pi 5, so it sees the cluster's network: Services by name, the Pis on your home network, and the internet. Answers go in ~/answers/.

## Look up a name
What IP addresses does graysoncodes.org resolve to? Save one of them to ~/answers/dns.txt. (They belong to Cloudflare, not your house: that's the point of the tunnel.)
hint: dig +short graysoncodes.org
hint: dig +short graysoncodes.org | head -1 > ~/answers/dns.txt
check: a=$(head -1 answers/dns.txt | tr -d ' '); [ -n "$a" ] && dig +short graysoncodes.org A graysoncodes.org AAAA | grep -qxF "$a"

## Cluster DNS
Inside the cluster, every Service has a name. Find the IP of the web Service in the graysoncodes namespace and save it to ~/answers/web-ip.txt.
hint: dig +short web.graysoncodes.svc.cluster.local
hint: cat /etc/resolv.conf   (see the search domains that make short names work)
check: [ "$(tr -d ' \n' < answers/web-ip.txt)" = "$(dig +short web.graysoncodes.svc.cluster.local | head -1)" ]

## Watch Pi-hole block an ad
Ask your Pi-hole on the Pi 4 (192.168.1.36) for doubleclick.net. Save the answer it gives to ~/answers/blocked.txt. Then ask 1.1.1.1 for the same name and compare.
hint: dig @192.168.1.36 doubleclick.net +short
hint: dig @1.1.1.1 doubleclick.net +short
check: grep -qx '0.0.0.0' answers/blocked.txt

## HTTP status codes
What status code does https://graysoncodes.org/blog return? Save it to ~/answers/status.txt.
hint: curl -s -o /dev/null -w '%{http_code}\n' https://graysoncodes.org/blog
check: [ "$(tr -d ' \n' < answers/status.txt)" = "$(curl -s -o /dev/null -w '%{http_code}' https://graysoncodes.org/blog)" ]

## Read the headers
Look at the response headers from https://graysoncodes.org. Which company does the server header name? Save that word to ~/answers/server.txt.
hint: curl -sI https://graysoncodes.org
check: grep -qix cloudflare answers/server.txt

## Who signed the certificate?
Use openssl to read graysoncodes.org's TLS certificate. Save the issuer's organisation (the O= part) to ~/answers/issuer.txt, and look at the expiry dates too.
hint: openssl s_client -connect graysoncodes.org:443 -servername graysoncodes.org </dev/null 2>/dev/null | openssl x509 -noout -issuer -dates
check: a=$(head -1 answers/issuer.txt | tr -d '\n'); [ ${#a} -ge 3 ] && openssl s_client -connect graysoncodes.org:443 -servername graysoncodes.org </dev/null 2>/dev/null | openssl x509 -noout -issuer | grep -qiF "$a"

## Your way out
Every packet that leaves this pod goes to a default gateway first. Save its IP to ~/answers/gateway.txt. (It's on the cni0 bridge on the Pi 5, not your router.)
hint: ip route
hint: ip route | awk '/default/ {print $3}' > ~/answers/gateway.txt
check: [ "$(tr -d ' \n' < answers/gateway.txt)" = "$(ip route | awk '/default/ {print $3; exit}')" ]

## NodePorts
The start page is reachable on every Pi at one port number. Find the start Service's nodePort in namespace start and save it to ~/answers/nodeport.txt.
hint: kubectl -n start get svc start
check: [ "$(tr -d ' \n' < answers/nodeport.txt)" = "$(kubectl -n start get svc start -o jsonpath='{.spec.ports[0].nodePort}')" ]

## Talk to a port by hand
HTTP is just text. Use nc to open port 80 on the web Service and type a request yourself:
    printf 'GET / HTTP/1.0\r\nHost: graysoncodes.org\r\n\r\n' | nc web.graysoncodes 80 | head -5
Save the first line of the reply (the status line) to ~/answers/raw.txt.
hint: printf 'GET / HTTP/1.0\r\nHost: graysoncodes.org\r\n\r\n' | nc -w 3 web.graysoncodes 80 | head -1 > ~/answers/raw.txt
check: grep -q '^HTTP/1\.[01] [0-9][0-9][0-9]' answers/raw.txt

## How far is the internet?
Trace the route to 1.1.1.1 and count the hops. Then ping your Pi 4 (192.168.1.36) and the internet and compare the times. (No check: just look.)
hint: traceroute -n 1.1.1.1
hint: ping -c 4 192.168.1.36; ping -c 4 1.1.1.1
