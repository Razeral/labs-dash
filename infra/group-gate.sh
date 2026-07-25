#!/usr/bin/env bash
# group-gate.sh — turn the Cognito group restriction on or off for labs-dash.
#
#   bash infra/group-gate.sh status
#   bash infra/group-gate.sh on          # restrict to $GROUP
#   bash infra/group-gate.sh off         # any TechPass user who can sign in
#
# The group name is baked into the Lambda@Edge bundle at build time (`__REQUIRED_GROUP__`),
# so toggling means: edit outputs.json -> rebuild the bundle -> republish -> repoint the
# distribution. That is what this script automates.
#
# STALE-TOKEN GOTCHA: `cognito:groups` is written into the ID token when it is ISSUED. Anyone
# already signed in keeps their old, group-less token and will get 403 until they re-login
# cleanly (clear cookies for BOTH labs.ai.tech.gov.sg and auth.labs.ai.tech.gov.sg, or wait
# for expiry). Adding someone to the group is necessary but not instantly sufficient.
set -euo pipefail
cd "$(dirname "$0")/.."

APP=dash
GROUP=labs-dash-users
DIST=EFEV1TL1LF6Y3
POOL=ap-southeast-1_zhuDvtEBS
LABS_AUTH="$(cd ../labs-auth && pwd)"
OUTPUTS="$LABS_AUTH/outputs.json"

current () { jq -r --arg a "$APP" '.appClients[$a].requiredGroup // ""' "$OUTPUTS"; }

status () {
  local g; g="$(current)"
  echo "outputs.json requiredGroup : ${g:-<none — any TechPass user>}"
  echo -n "deployed bundle           : "
  if [ -f "$LABS_AUTH/edge-auth/build/index.js" ]; then
    grep -o "const REQUIRED_GROUP = '[^']*'" "$LABS_AUTH/edge-auth/build/index.js" || echo "unknown"
  else
    echo "not built locally"
  fi
  echo -n "group members             : "
  aws cognito-idp list-users-in-group --user-pool-id "$POOL" --group-name "$GROUP" \
    --query 'Users[].Attributes[?Name==`email`].Value|[]' --output text 2>/dev/null || echo "(group missing)"
}

apply () {
  local want="$1"
  # Merge, never replace — a full-object write would wipe clientId/callbackBase.
  local tmp; tmp="$(mktemp)"
  jq --arg a "$APP" --arg g "$want" \
    'if $g == "" then .appClients[$a] |= (del(.requiredGroup))
     else .appClients[$a] += {requiredGroup: $g} end' "$OUTPUTS" > "$tmp" && mv "$tmp" "$OUTPUTS"

  if [ -n "$want" ]; then
    aws cognito-idp get-group --user-pool-id "$POOL" --group-name "$want" >/dev/null 2>&1 \
      || aws cognito-idp create-group --user-pool-id "$POOL" --group-name "$want" \
           --description "Authorized users for ${APP}" >/dev/null
    local n
    n="$(aws cognito-idp list-users-in-group --user-pool-id "$POOL" --group-name "$want" \
         --query 'length(Users)' --output text)"
    # Turning on a gate whose group is empty locks out everyone, including you.
    [ "$n" -gt 0 ] 2>/dev/null || { echo "ERROR: group ${want} has no members — refusing to lock everyone out" >&2; exit 1; }
    echo "group ${want} has ${n} member(s)"
  fi

  ( cd "$LABS_AUTH/edge-auth" && bash build.sh "$APP" )
  ( cd "$LABS_AUTH" && bash provision-edge.sh "$APP" "$DIST" )
}

case "${1:-status}" in
  status) status ;;
  on)     apply "$GROUP"; echo; status ;;
  off)    apply ""; echo; status ;;
  *) echo "usage: $0 {status|on|off}" >&2; exit 1 ;;
esac
