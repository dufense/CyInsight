#!/bin/bash
while true; do
  echo "$(date): Starting server..."
  NODE_OPTIONS='--max-old-space-size=384' node dist/index.cjs
  EXIT_CODE=$?
  echo "$(date): Server exited with code $EXIT_CODE, restarting in 2s..."
  sleep 2
done
