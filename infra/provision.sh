#!/usr/bin/env bash
# provision.sh — create the labs-dash hosting stack. Idempotent: safe to re-run.
#
#   private S3 bucket  ->  CloudFront (OAC origin) at labs.ai.tech.gov.sg
#                          + WAF web ACL (default BLOCK, allow shared corp IP set)
#
# The Lambda@Edge TechPass gate is NOT installed here — see labs-auth/provision-edge.sh
# (run after this) which is the access cutover.
set -euo pipefail

REGION_S3="ap-southeast-1"
ACCOUNT="323001028968"
BUCKET="labs-dash-site"
DOMAIN="labs.ai.tech.gov.sg"
WAF_NAME="labs-dash-cf-waf"
OAC_NAME="labs-dash-oac"
# *.labs.ai.tech.gov.sg WITH labs.ai.tech.gov.sg as an explicit SAN. A bare wildcard would
# not cover the apex; this cert does. Expires 2026-12-12.
CERT_ARN="arn:aws:acm:us-east-1:${ACCOUNT}:certificate/f053a5a8-7d8b-409c-b733-c4801a2485cf"
# Shared corp allowlist, also used by depot. Despite the "block-non-…" name it holds the
# ADDRESSES TO ALLOW; it is referenced by an Allow rule under a default-Block ACL.
IPSET_ARN="arn:aws:wafv2:us-east-1:${ACCOUNT}:global/ipset/CreatedByCloudFront-1e377e80_block-non-seedcomet-ip_IPV4/9d3f71d7-cf87-4db4-888e-ce177b3347ec"
TAGS_S3='TagSet=[{Key=Project,Value=labs-dash},{Key=Owner,Value=ng_shangru},{Key=Environment,Value=prd}]'
CF_TAGS='"Items":[{"Key":"Project","Value":"labs-dash"},{"Key":"Owner","Value":"ng_shangru"},{"Key":"Environment","Value":"prd"}]'
CACHE_POLICY_OPTIMIZED="658327ea-f89d-4fab-a63d-7e88639e58f6"

say() { printf '\n== %s\n' "$1"; }

say "identity"
aws sts get-caller-identity --query Account --output text | grep -qx "$ACCOUNT" \
  || { echo "ERROR: wrong AWS account (expected $ACCOUNT)" >&2; exit 1; }

say "bucket $BUCKET"
if aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  echo "exists"
else
  aws s3api create-bucket --bucket "$BUCKET" --region "$REGION_S3" \
    --create-bucket-configuration "LocationConstraint=${REGION_S3}" >/dev/null
  echo "created"
fi
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-tagging --bucket "$BUCKET" --tagging "$TAGS_S3"

say "waf web acl $WAF_NAME"
WAF_ARN="$(aws wafv2 list-web-acls --scope CLOUDFRONT --region us-east-1 \
  --query "WebACLs[?Name=='${WAF_NAME}'].ARN | [0]" --output text)"
if [ "$WAF_ARN" = "None" ] || [ -z "$WAF_ARN" ]; then
  WAF_ARN="$(aws wafv2 create-web-acl --name "$WAF_NAME" --scope CLOUDFRONT --region us-east-1 \
    --default-action Block={} \
    --visibility-config \
      SampledRequestsEnabled=true,CloudWatchMetricsEnabled=true,MetricName="$WAF_NAME" \
    --rules "[{\"Name\":\"allow-shared-corp-egress\",\"Priority\":0,\"Statement\":{\"IPSetReferenceStatement\":{\"ARN\":\"${IPSET_ARN}\"}},\"Action\":{\"Allow\":{}},\"VisibilityConfig\":{\"SampledRequestsEnabled\":true,\"CloudWatchMetricsEnabled\":true,\"MetricName\":\"allow-corp\"}}]" \
    --tags Key=Project,Value=labs-dash Key=Owner,Value=ng_shangru Key=Environment,Value=prd \
    --query 'Summary.ARN' --output text)"
  echo "created"
else
  echo "exists"
fi
echo "  $WAF_ARN"

# Sanity: an Allow rule pointing at an EMPTY ip set under a default-Block ACL would deny
# every request including our own. Refuse to wire that up.
IPSET_COUNT="$(aws wafv2 get-ip-set --region us-east-1 --scope CLOUDFRONT \
  --name "CreatedByCloudFront-1e377e80_block-non-seedcomet-ip_IPV4" \
  --id 9d3f71d7-cf87-4db4-888e-ce177b3347ec --query 'length(IPSet.Addresses)' --output text)"
[ "$IPSET_COUNT" -gt 0 ] 2>/dev/null \
  || { echo "ERROR: corp IP set is empty — a default-Block ACL would deny everyone" >&2; exit 1; }
echo "  corp allowlist entries: $IPSET_COUNT"

say "origin access control $OAC_NAME"
OAC_ID="$(aws cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='${OAC_NAME}'].Id | [0]" --output text)"
if [ "$OAC_ID" = "None" ] || [ -z "$OAC_ID" ]; then
  OAC_ID="$(aws cloudfront create-origin-access-control \
    --origin-access-control-config \
      "Name=${OAC_NAME},Description=labs-dash s3 origin,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3" \
    --query 'OriginAccessControl.Id' --output text)"
  echo "created"
else
  echo "exists"
fi
echo "  $OAC_ID"

say "distribution for $DOMAIN"
DIST_ID="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(Aliases.Items || \`[]\`, '${DOMAIN}')].Id | [0]" \
  --output text 2>/dev/null || echo None)"
if [ "$DIST_ID" = "None" ] || [ -z "$DIST_ID" ]; then
  ORIGIN_DOMAIN="${BUCKET}.s3.${REGION_S3}.amazonaws.com"
  CONFIG="$(mktemp)"
  cat > "$CONFIG" <<JSON
{
  "CallerReference": "labs-dash-$(aws sts get-caller-identity --query Account --output text)-v1",
  "Aliases": { "Quantity": 1, "Items": ["${DOMAIN}"] },
  "DefaultRootObject": "index.html",
  "Origins": { "Quantity": 1, "Items": [{
    "Id": "s3-${BUCKET}",
    "DomainName": "${ORIGIN_DOMAIN}",
    "OriginAccessControlId": "${OAC_ID}",
    "S3OriginConfig": { "OriginAccessIdentity": "" },
    "ConnectionAttempts": 3, "ConnectionTimeout": 10,
    "OriginShield": { "Enabled": false }
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-${BUCKET}",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": { "Quantity": 2, "Items": ["GET","HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] } },
    "Compress": true,
    "CachePolicyId": "${CACHE_POLICY_OPTIMIZED}",
    "LambdaFunctionAssociations": { "Quantity": 0 }
  },
  "Comment": "labs-dash — internal labs index (IP-fenced + TechPass)",
  "Enabled": true,
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "PriceClass": "PriceClass_All",
  "WebACLId": "${WAF_ARN}",
  "ViewerCertificate": {
    "ACMCertificateArn": "${CERT_ARN}",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021",
    "CertificateSource": "acm"
  }
}
JSON
  # A CNAMEAlreadyExists here means another distribution (possibly in another account)
  # holds the alias. That is a zone-owner conversation, not something to work around.
  if ! OUT="$(aws cloudfront create-distribution-with-tags --distribution-config-with-tags \
       "{\"DistributionConfig\": $(cat "$CONFIG"), \"Tags\": {$CF_TAGS}}" \
       --query 'Distribution.[Id,DomainName]' --output text 2>&1)"; then
    echo "$OUT" >&2
    case "$OUT" in
      *CNAMEAlreadyExists*) echo "HALT: ${DOMAIN} is claimed by another distribution." >&2 ;;
    esac
    rm -f "$CONFIG"; exit 1
  fi
  rm -f "$CONFIG"
  DIST_ID="$(echo "$OUT" | awk '{print $1}')"
  echo "created $OUT"
else
  echo "exists $DIST_ID"
fi

say "bucket policy (OAC read for this distribution only)"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "$(cat <<JSON
{"Version":"2012-10-17","Statement":[{
  "Sid":"AllowCloudFrontOAC","Effect":"Allow",
  "Principal":{"Service":"cloudfront.amazonaws.com"},
  "Action":"s3:GetObject","Resource":"arn:aws:s3:::${BUCKET}/*",
  "Condition":{"StringEquals":{"AWS:SourceArn":"arn:aws:cloudfront::${ACCOUNT}:distribution/${DIST_ID}"}}
}]}
JSON
)"

say "done"
echo "CLOUDFRONT_DIST_ID=${DIST_ID}"
echo "S3_BUCKET=${BUCKET}"
echo
echo "Next: build+sync (scripts/deploy.sh), then the access cutover:"
echo "  cd ../labs-auth && bash provision-appclient.sh dash https://${DOMAIN}"
echo "  cd ../labs-auth/edge-auth && bash build.sh dash"
echo "  cd ../labs-auth && bash provision-edge.sh dash ${DIST_ID}"
