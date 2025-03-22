#!/bin/sh

echo "Deploying commands..."
node deploy-commands.js

echo "Starting CrumbBot..."
node index.js
