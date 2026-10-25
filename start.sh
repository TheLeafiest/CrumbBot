#!/bin/sh

echo "Deploying commands..."
if ! node dist/deploy-commands.js; then
  # Keep the bot up; the previously registered commands still work
  echo "WARNING: slash command deploy failed, starting with previously registered commands" >&2
fi

echo "Starting CrumbBot..."
# exec so node is PID 1 and receives SIGTERM from `docker stop`
exec node dist/index.js
