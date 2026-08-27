#!/usr/bin/env bash
# provision-cicd.sh — set up the auto-roster CI/CD pipeline
#
# Creates:
#   1. CodeBuild project (labs-dash-auto-roster) — runs auto-roster + deploy
#   2. Lambda function (labs-dash-cicd-trigger) — EventBridge → CodeBuild
#   3. EventBridge rule — CloudFront mutations → Lambda
#   4. IAM roles for Lambda and CodeBuild
#
# Idempotent: safe to re-run.
set -euo pipefail

ACCOUNT="323001028968"
REGION="ap-southeast-1"
PROJECT_NAME="labs-dash-auto-roster"
LAMBDA_NAME="labs-dash-cicd-trigger"
RULE_NAME="labs-dash-cf-changes"
REPO_URL="${LABS_DASH_REPO_URL:-}"  # Set to GitLab HTTPS URL if available

say() { printf '\n== %s\n' "$1"; }

say "identity"
aws sts get-caller-identity --query Account --output text | grep -qx "$ACCOUNT" \
  || { echo "ERROR: wrong AWS account (expected $ACCOUNT)" >&2; exit 1; }

# ---- CodeBuild project ----
say "codebuild project $PROJECT_NAME"

if [ -z "$REPO_URL" ]; then
  echo "WARNING: LABS_DASH_REPO_URL not set. CodeBuild will use NO_SOURCE."
  echo "         Set it to the GitLab repo URL and re-run to enable git-based builds."
  SOURCE_JSON='{"type":"NO_SOURCE","buildspec":"buildspec.yml"}'
else
  SOURCE_JSON="{\"type\":\"GITLAB_SELF_MANAGED\",\"location\":\"${REPO_URL}\",\"buildspec\":\"buildspec.yml\"}"
fi

if aws codebuild batch-get-projects --names "$PROJECT_NAME" --query 'projects[0].name' --output text 2>/dev/null | grep -qv None; then
  echo "exists — updating"
  aws codebuild update-project \
    --name "$PROJECT_NAME" \
    --source "$SOURCE_JSON" \
    --environment '{"type":"LINUX_CONTAINER","computeType":"BUILD_GENERAL1_SMALL","image":"aws/codebuild/amazonlinux2-x86_64-standard:5.0","privilegedMode":false}' \
    --service-role "arn:aws:iam::${ACCOUNT}:role/${PROJECT_NAME}-role" \
    --artifacts '{"type":"NO_ARTIFACTS"}' \
    --cache '{"type":"LOCAL","modes":["LOCAL_CACHE_MODE_CUSTOM"]}' \
    --timeout-in-minutes 10 \
    > /dev/null
else
  aws codebuild create-project \
    --name "$PROJECT_NAME" \
    --source "$SOURCE_JSON" \
    --environment '{"type":"LINUX_CONTAINER","computeType":"BUILD_GENERAL1_SMALL","image":"aws/codebuild/amazonlinux2-x86_64-standard:5.0","privilegedMode":false}' \
    --service-role "arn:aws:iam::${ACCOUNT}:role/${PROJECT_NAME}-role" \
    --artifacts '{"type":"NO_ARTIFACTS"}' \
    --cache '{"type":"LOCAL","modes":["LOCAL_CACHE_MODE_CUSTOM"]}' \
    --timeout-in-minutes 10 \
    --tags key=Project-Code,value=labs-dash key=Owner,value=aip-labs key=Environment,value=prd \
    > /dev/null
  echo "created"
fi

# ---- CodeBuild IAM role ----
say "codebuild role ${PROJECT_NAME}-role"
CB_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${PROJECT_NAME}-role"
if aws iam get-role --role-name "${PROJECT_NAME}-role" >/dev/null 2>&1; then
  echo "exists"
else
  aws iam create-role \
    --role-name "${PROJECT_NAME}-role" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{"Effect": "Allow", "Principal": {"Service": "codebuild.amazonaws.com"}, "Action": "sts:AssumeRole"}]
    }' \
    --tags key=Project-Code,value=labs-dash key=Owner,value=aip-labs key=Environment,value=prd \
    > /dev/null

  # Inline policy: S3 read/write for labs-dash-site, CloudFront invalidation, CloudFront list, STS
  aws iam put-role-policy \
    --role-name "${PROJECT_NAME}-role" \
    --policy-name "${PROJECT_NAME}-deploy" \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [
        {\"Effect\": \"Allow\", \"Action\": [\"s3:GetObject\",\"s3:PutObject\",\"s3:DeleteObject\",\"s3:ListBucket\"], \"Resource\": [\"arn:aws:s3:::labs-dash-site\",\"arn:aws:s3:::labs-dash-site/*\"]},
        {\"Effect\": \"Allow\", \"Action\": [\"cloudfront:CreateInvalidation\",\"cloudfront:GetDistribution\",\"cloudfront:ListDistributions\"], \"Resource\": \"*\"},
        {\"Effect\": \"Allow\", \"Action\": [\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"], \"Resource\": \"arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/codebuild/${PROJECT_NAME}:*\"},
        {\"Effect\": \"Allow\", \"Action\": [\"ssm:GetParameter\",\"ssm:PutParameter\"], \"Resource\": \"arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/labs-dash/*\"}
      ]
    }"
  echo "created"
fi

# ---- Lambda function ----
say "lambda $LAMBDA_NAME"
LAMBDA_ROLE_ARN="arn:aws:iam::${ACCOUNT}:role/${LAMBDA_NAME}-role"

if aws iam get-role --role-name "${LAMBDA_NAME}-role" >/dev/null 2>&1; then
  echo "role exists"
else
  aws iam create-role \
    --role-name "${LAMBDA_NAME}-role" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{"Effect": "Allow", "Principal": {"Service": "lambda.amazonaws.com"}, "Action": "sts:AssumeRole"}]
    }' \
    --tags key=Project-Code,value=labs-dash key=Owner,value=aip-labs key=Environment,value=prd \
    > /dev/null

  aws iam put-role-policy \
    --role-name "${LAMBDA_NAME}-role" \
    --policy-name "${LAMBDA_NAME}-policy" \
    --policy-document "{
      \"Version\": \"2012-10-17\",
      \"Statement\": [
        {\"Effect\": \"Allow\", \"Action\": [\"codebuild:StartBuild\"], \"Resource\": \"arn:aws:codebuild:${REGION}:${ACCOUNT}:project/${PROJECT_NAME}\"},
        {\"Effect\": \"Allow\", \"Action\": [\"ssm:GetParameter\",\"ssm:PutParameter\"], \"Resource\": \"arn:aws:ssm:${REGION}:${ACCOUNT}:parameter/labs-dash/*\"},
        {\"Effect\": \"Allow\", \"Action\": [\"logs:CreateLogGroup\",\"logs:CreateLogStream\",\"logs:PutLogEvents\"], \"Resource\": \"arn:aws:logs:${REGION}:${ACCOUNT}:log-group:/aws/lambda/${LAMBDA_NAME}:*\"}
      ]
    }"
  echo "role created"
fi

# Package and deploy Lambda
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT
cp infra/cicd-lambda.py "$TMPDIR/lambda_function.py"
(cd "$TMPDIR" && zip -q lambda.zip lambda_function.py)

if aws lambda get-function --function-name "$LAMBDA_NAME" >/dev/null 2>&1; then
  aws lambda update-function-code \
    --function-name "$LAMBDA_NAME" \
    --zip-file "fileb://$TMPDIR/lambda.zip" > /dev/null
  echo "code updated"
else
  aws lambda create-function \
    --function-name "$LAMBDA_NAME" \
    --runtime python3.12 \
    --handler lambda_function.handler \
    --role "$LAMBDA_ROLE_ARN" \
    --zip-file "fileb://$TMPDIR/lambda.zip" \
    --timeout 30 \
    --memory-size 128 \
    --environment "Variables={CODEBUILD_PROJECT=${PROJECT_NAME},DEBOUNCE_SECONDS=300}" \
    --tags "Project-Code=labs-dash" "Owner=aip-labs" "Environment=prd" \
    > /dev/null
  echo "created"
fi

# ---- EventBridge rule ----
say "eventbridge rule $RULE_NAME"
LAMBDA_ARN="arn:aws:lambda:${REGION}:${ACCOUNT}:function:${LAMBDA_NAME}"

# Create/update the rule
aws events put-rule \
  --name "$RULE_NAME" \
  --event-pattern '{
    "source": ["aws.cloudfront"],
    "detail-type": ["AWS API Call via CloudTrail"],
    "detail": {
      "eventSource": ["cloudfront.amazonaws.com"],
      "eventName": ["CreateDistribution", "UpdateDistribution", "CreateDistributionWithTags"]
    }
  }' \
  --state ENABLED \
  --description "Trigger labs-dash auto-roster when CloudFront distributions change" \
  > /dev/null

# Grant EventBridge permission to invoke Lambda
aws lambda add-permission \
  --function-name "$LAMBDA_NAME" \
  --statement-id "allow-eventbridge-$RULE_NAME" \
  --action "lambda:InvokeFunction" \
  --principal "events.amazonaws.com" \
  --source-arn "arn:aws:events:${REGION}:${ACCOUNT}:rule/$RULE_NAME" \
  2>/dev/null || echo "permission already exists"

# Add Lambda as target
aws events put-targets \
  --rule "$RULE_NAME" \
  --targets "[{\"Id\":\"${LAMBDA_NAME}\",\"Arn\":\"${LAMBDA_ARN}\"}]" \
  > /dev/null

echo "rule active"

# ---- Summary ----
say "done"
echo "Pipeline:"
echo "  CloudFront mutation → EventBridge ($RULE_NAME) → Lambda ($LAMBDA_NAME) → CodeBuild ($PROJECT_NAME)"
echo ""
echo "Manual trigger:"
echo "  aws codebuild start-build --project-name $PROJECT_NAME"
echo ""
echo "To enable git-based builds, set LABS_DASH_REPO_URL and re-run:"
echo "  LABS_DASH_REPO_URL=https://sgts.gitlab-dedicated.com/.../labs-dash.git bash infra/provision-cicd.sh"
