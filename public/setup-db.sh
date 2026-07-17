#!/bin/sh
export PATH="/opt/alt/alt-nodejs22/root/usr/bin:$PATH"
export NODE_ENV="production"

echo "=== Starting DB Setup ==="
cd /home/u822096817/domains/space.ateonlabs.com/nodejs || exit 1

echo "1. Checking Node and NPM versions..."
node -v
npm -v

echo "2. Copying schema.prisma and seed.js from latest source if needed..."
if [ -d "/home/u822096817/domains/space.ateonlabs.com/public_html/.builds/last-source/prisma" ]; then
  cp -r /home/u822096817/domains/space.ateonlabs.com/public_html/.builds/last-source/prisma ./prisma
  cp /home/u822096817/domains/space.ateonlabs.com/public_html/.builds/last-source/seed.js ./seed.js
fi

echo "3. Installing prisma CLI inside standalone nodejs directory..."
npm install --no-save prisma@latest

echo "4. Pushing Prisma Schema (db push)..."
./node_modules/.bin/prisma db push --schema=./prisma/schema.prisma --skip-generate

echo "5. Running Database Seeder..."
node seed.js

echo "=== DB Setup Completed Successfully ==="
