"""
cicd-lambda.py — EventBridge-triggered Lambda that rebuilds labs-dash when CloudFront changes.

Triggered by CloudFront distribution create/update events via EventBridge.
Runs `npm run auto-roster:deploy` in a CodeBuild project that has the repo checked out.

Architecture:
  CloudFront API call
    → EventBridge rule (source: aws.cloudfront, detail-type: AWS API Call)
      → this Lambda
        → CodeBuild project (clones repo, runs auto-roster:deploy)

Why CodeBuild instead of running npm in Lambda:
  - Lambda has no git, no node_modules, no AWS CLI for S3 sync
  - CodeBuild gives us a full build environment with caching
  - Build spec lives in the repo, version-controlled
"""
import json
import boto3
import os

CODEBUILD_PROJECT = os.environ.get("CODEBUILD_PROJECT", "labs-dash-auto-roster")
DEBOUNCE_SECONDS = int(os.environ.get("DEBOUNCE_SECONDS", "300"))

codebuild = boto3.client("codebuild")
ssm = boto3.client("ssm")

# Simple debounce: store last trigger time in SSM Parameter Store
LAST_TRIGGER_PARAM = "/labs-dash/last-auto-roster-trigger"


def should_trigger():
    """Debounce: skip if we triggered recently."""
    import time
    now = int(time.time())
    try:
        resp = ssm.get_parameter(Name=LAST_TRIGGER_PARAM)
        last = int(resp["Parameter"]["Value"])
        if now - last < DEBOUNCE_SECONDS:
            return False
    except ssm.exceptions.ParameterNotFound:
        pass

    ssm.put_parameter(
        Name=LAST_TRIGGER_PARAM,
        Value=str(now),
        Type="String",
        Overwrite=True,
    )
    return True


def handler(event, context):
    """
    EventBridge handler for CloudFront API calls.

    Triggers on: CreateDistribution, UpdateDistribution, CreateDistributionWithTags
    These fire when any distribution's aliases change (new project deployed).
    """
    detail = event.get("detail", {})
    event_name = detail.get("eventName", "")

    # Only care about distribution mutations
    if event_name not in ("CreateDistribution", "UpdateDistribution", "CreateDistributionWithTags"):
        return {"statusCode": 200, "body": "ignored: not a distribution mutation"}

    # Debounce — multiple distributions might change in quick succession
    if not should_trigger():
        return {"statusCode": 200, "body": "debounced: recent trigger exists"}

    # Trigger CodeBuild
    try:
        resp = codebuild.start_build(projectName=CODEBUILD_PROJECT)
        build_id = resp["build"]["id"]
        return {
            "statusCode": 200,
            "body": json.dumps({
                "triggered": True,
                "event": event_name,
                "buildId": build_id,
            }),
        }
    except Exception as e:
        return {"statusCode": 500, "body": f"CodeBuild start failed: {e}"}
