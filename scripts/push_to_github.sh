#!/bin/bash

# 1) Controleer of GITHUB_TOKEN bestaat
if [ -z "$GITHUB_TOKEN" ]; then
  echo "FOUT: GITHUB_TOKEN is niet ingesteld in Replit Secrets."
  exit 1
fi

# 2) Origin zetten
git remote remove origin 2>/dev/null || true
git remote add origin https://github.com/jasperdiks1979-star/Getpawsy.git

# 3) Status en diff printen
echo "--- GIT STATUS ---"
git status
echo ""
echo "--- GIT DIFF STAT ---"
git diff --stat

# 4) Git config instellen (nodig voor commit)
git config user.email "replit-agent@replit.com"
git config user.name "Replit Agent"

# 5) Alles toevoegen en committen
git add -A
if git diff-index --quiet HEAD --; then
  echo "Geen wijzigingen om te committen."
else
  git commit -m "Rebuild/fixes: sticky bar, pawsy overlap, image fallback, variants/cart"
fi

# 6) Pushen met token
echo "Pushing to GitHub..."
git push https://$GITHUB_TOKEN@github.com/jasperdiks1979-star/Getpawsy.git main

# 7) Laatste commit printen
echo ""
echo "--- LATEST COMMIT ---"
git log -1 --oneline
