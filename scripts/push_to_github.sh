#!/bin/bash
set -e

# 1) Controleer of GITHUB_TOKEN bestaat
if [ -z "$GITHUB_TOKEN" ]; then
  echo "FOUT: GITHUB_TOKEN is niet ingesteld in Replit Secrets."
  exit 1
fi

echo "--- GIT STATUS ---"
git status
echo ""

# Origin zetten naar token-URL (voor authenticatie)
echo "Configuring origin with GITHUB_TOKEN..."
git remote remove origin 2>/dev/null || true
git remote add origin https://x-access-token:$GITHUB_TOKEN@github.com/jasperdiks1979-star/GetPawsy.git

# Git config (nodig voor commit)
git config user.email "replit-agent@replit.com"
git config user.name "Replit Agent"

# 2) Alles toevoegen en committen indien nodig
echo "Staging changes..."
git add -A

if git diff-index --quiet HEAD --; then
  echo "Geen wijzigingen om te committen."
else
  echo "Committing changes..."
  git commit -m "Auto: sync from Replit"
fi

# 3) Pushen naar main
echo "Pushing to GitHub (main branch)..."
git push -u origin main

# 4) Rapportage
echo ""
echo "--- SUCCESS ---"
echo "Laatste commit hash: $(git rev-parse --short HEAD)"
echo "Remote URL: https://github.com/jasperdiks1979-star/GetPawsy.git"
