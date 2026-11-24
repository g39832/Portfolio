#!/bin/bash
# Bash lab: scripts to fix and scripts to write.
set -e
cd "$HOME"
mkdir -p scripts data
cat > scripts/broken.sh <<'S'
#!/bin/bash
# Copies a folder somewhere. shellcheck has a few complaints about it.
src=$1
dest=$2
echo Copying $src to $dest
files=`ls $src`
for f in $files; do
  cp $src/$f $dest
done
if [ $dest == "" ]; then echo "no destination"; fi
S
cat > scripts/deploy.sh <<'S'
#!/bin/bash
# Pretend deploy. Without strict mode, a failed step is silently ignored.
cd /does/not/exist
echo "deploying from $(pwd)"
S
printf 'web\nblog\nledger\njellyfin\npihole\n' > data/servers.txt
chmod +x scripts/*.sh
printf 'Bash lab. Scripts are in ~/scripts, data in ~/data.\n' > README.txt
