#!/bin/bash

echo "🐾 GetPawsy V2.2 — Auto-start (Autoscale-Safe)"
set -e

echo "📦 Checking Node.js..."
node --version

echo "📂 Creating required directories..."
mkdir -p data

echo "🗄️ Checking database file..."
if [ ! -f data/db.json ]; then
  echo '{ "products": [] }' > data/db.json
  echo "✅ data/db.json created"
else
  echo "✅ data/db.json exists"
fi

echo "📦 Checking/Installing dependencies..."
if [ ! -d node_modules ]; then
  echo "Running: npm install"
  npm install || {
    echo "⚠ npm install failed - checking for partial installation..."
    if [ -d node_modules ] && [ -f node_modules/.package-lock.json ]; then
      echo "Proceeding with partial installation..."
    else
      echo "ERROR: npm install failed and no partial installation found"
      exit 1
    fi
  }
  echo "✅ Dependencies installed/verified"
else
  echo "✅ node_modules exists"
fi

echo "🚀 Starting GetPawsy V2.2..."
npm start
