#!/usr/bin/env bash
# deploy.sh — build the site and publish it to S3 + CloudFront.
# Reads config from .env (gitignored). See .env.sample.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${S3_BUCKET:?set S3_BUCKET in .env}"
: "${CLOUDFRONT_DIST_ID:?set CLOUDFRONT_DIST_ID in .env}"

# VITE_OWNER_EMAIL is baked in at build time. Unset means the owner check can never match,
# so drag-and-drop re-tiering silently never appears. Fail loudly instead.
: "${VITE_OWNER_EMAIL:?set VITE_OWNER_EMAIL in .env — edit mode is inert without it}"

npm run build

# index.html must not be cached hard: it is how a new build reaches an open tab. Hashed
# assets under /assets/ are immutable and safe to cache for a year.
#
# share.png is excluded from the immutable sweep because its filename is NOT content-hashed.
# Under max-age=31536000,immutable a replacement would be pinned in viewer caches for a year
# with no way to bust it short of renaming the file. It gets an hour instead — long enough to
# be cheap, short enough that a new share image actually lands.
aws s3 sync dist/ "s3://${S3_BUCKET}/" --delete \
  --exclude 'index.html' --exclude 'share.png' --cache-control 'public,max-age=31536000,immutable'
aws s3 cp dist/index.html "s3://${S3_BUCKET}/index.html" \
  --cache-control 'public,max-age=0,must-revalidate' --content-type 'text/html; charset=utf-8'
if [ -f dist/share.png ]; then
  aws s3 cp dist/share.png "s3://${S3_BUCKET}/share.png" \
    --cache-control 'public,max-age=3600' --content-type 'image/png'
fi

aws cloudfront create-invalidation --distribution-id "${CLOUDFRONT_DIST_ID}" \
  --paths '/*' --query 'Invalidation.[Id,Status]' --output text

echo "deployed ${S3_BUCKET} -> ${CLOUDFRONT_DIST_ID}"
