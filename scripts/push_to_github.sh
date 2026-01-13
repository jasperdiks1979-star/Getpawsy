#!/bin/bash

# 1) Controleer of GITHUB_TOKEN bestaat
if [ -z "$GITHUB_TOKEN" ]; then
  echo "FOUT: GITHUB_TOKEN is niet ingesteld in Replit Secrets."
  exit 1
fi

echo "--- GIT STATUS ---"
git status
echo ""
echo "--- GIT DIFF STAT ---"
git diff --stat

# Origin zetten
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/jasperdiks1979-star/Getpawsy.git

# Git config (nodig voor commit)
git config user.email "replit-agent@replit.com"
git config user.name "Replit Agent"

# 4) Alles toevoegen en committen
git add -A
if git diff-index --quiet HEAD --; then
  echo "Geen wijzigingen om te committen."
else
  git commit -m "Fix footer stamp + image fallback"
fi

# 5) Pushen met token
echo "Pushing to GitHub..."
git push https://$GITHUB_TOKEN@github.com/jasperdiks1979-star/Getpawsy.git main

# 6) Laatste commit printen
echo ""
echo "--- LATEST COMMIT ---"
git log -1 --oneline
