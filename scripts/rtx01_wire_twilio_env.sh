#!/usr/bin/env bash
set -euo pipefail

PUBLIC_URL="${1:-}"
if [ -z "$PUBLIC_URL" ]; then
  PUBLIC_URL=$(curl -fsS http://127.0.0.1:4040/api/tunnels | jq -r '.tunnels[] | select(.proto=="https") | .public_url' | head -n1)
fi

[ -n "$PUBLIC_URL" ] || { echo "No ngrok https URL found"; exit 1; }
[ -f .env ] || cp .env.example .env

STREAM_URL="wss://${PUBLIC_URL#https://}/twilio-media"

if grep -q '^TWILIO_PUBLIC_BASE_URL=' .env; then
  sed -i "s#^TWILIO_PUBLIC_BASE_URL=.*#TWILIO_PUBLIC_BASE_URL=$PUBLIC_URL#" .env
else
  echo "TWILIO_PUBLIC_BASE_URL=$PUBLIC_URL" >> .env
fi

if grep -q '^TWILIO_MEDIA_STREAM_URL=' .env; then
  sed -i "s#^TWILIO_MEDIA_STREAM_URL=.*#TWILIO_MEDIA_STREAM_URL=$STREAM_URL#" .env
else
  echo "TWILIO_MEDIA_STREAM_URL=$STREAM_URL" >> .env
fi

if grep -q '^TWILIO_VALIDATE_SIGNATURE=' .env; then
  sed -i 's#^TWILIO_VALIDATE_SIGNATURE=.*#TWILIO_VALIDATE_SIGNATURE=false#' .env
else
  echo "TWILIO_VALIDATE_SIGNATURE=false" >> .env
fi

echo "TWILIO_PUBLIC_BASE_URL=$PUBLIC_URL"
echo "TWILIO_MEDIA_STREAM_URL=$STREAM_URL"
