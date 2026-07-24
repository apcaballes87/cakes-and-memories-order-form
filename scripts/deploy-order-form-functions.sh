#!/usr/bin/env bash

set -euo pipefail

expected_ref="congofivupobtfudnhni"
expected_project_name="Cake app"
expected_create_version="26"
expected_verify_version="24"
expected_create_digest="68b26da3e24e9af3a7c24f63c1a7c7841892074ab1d1c30060cf0e1dd1ebae6d"
expected_verify_digest="2599f9a22e7bab7e2c527d4d0f44b3ef1b58fe65e562ec36083111f574a7ce1d"
cutover_confirmation="PHASE2-CUTOVER-congofivupobtfudnhni"

usage() {
  {
    echo "Usage:"
    echo "  scripts/deploy-order-form-functions.sh --check"
    echo "  scripts/deploy-order-form-functions.sh --deploy $cutover_confirmation"
    echo
    echo "The deploy action is gated for the Phase 2 cutover. It never applies"
    echo "migrations, never disables JWT verification, and never prunes functions."
  } >&2
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 2
fi

action="$1"
confirmation="${2:-}"

if [[ "$action" != "--check" && "$action" != "--deploy" ]]; then
  usage
  exit 2
fi

if [[ "$action" == "--check" && -n "$confirmation" ]]; then
  usage
  exit 2
fi

if [[ "$action" == "--deploy" && "$confirmation" != "$cutover_confirmation" ]]; then
  echo "Refusing deployment: the explicit Phase 2 cutover confirmation is missing." >&2
  usage
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "$script_dir/.." && pwd)"
linked_project_file="$repo_dir/supabase/.temp/linked-project.json"
project_ref_file="$repo_dir/supabase/.temp/project-ref"
shared_source="$repo_dir/supabase/functions/_shared/order-submission.ts"
migration_glob="$repo_dir/supabase/migrations/"'*_add_order_submission_reliability.sql'
function_names=(
  "initialize-order-upload"
  "submit-order"
  "create-xendit-payment"
  "verify-xendit-payment"
)

if [[ ! -d "$repo_dir/.git" ]]; then
  echo "Refusing deployment: repository not found at $repo_dir" >&2
  exit 1
fi

linked_ref=""
linked_name=""
if [[ -f "$project_ref_file" ]]; then
  linked_ref="$(tr -d '[:space:]' < "$project_ref_file")"
elif [[ -f "$linked_project_file" ]]; then
  linked_ref="$(
    sed -nE 's/.*"ref"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' \
      "$linked_project_file"
  )"
  linked_name="$(
    sed -nE 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' \
      "$linked_project_file"
  )"
fi

if [[ "$linked_ref" != "$expected_ref" ]]; then
  echo "Refusing deployment: linked project is '$linked_ref', expected '$expected_ref'." >&2
  exit 1
fi

if [[ -n "$linked_name" && "$linked_name" != "$expected_project_name" ]]; then
  echo "Refusing deployment: linked project name is '$linked_name', expected '$expected_project_name'." >&2
  exit 1
fi

if [[ ! -f "$shared_source" ]]; then
  echo "Refusing deployment: missing shared order-submission source." >&2
  exit 1
fi

if ! rg -q --fixed-strings "CAKE_APP_PROJECT_REF = '$expected_ref'" "$shared_source"; then
  echo "Refusing deployment: shared source lacks the Cake App project marker." >&2
  exit 1
fi

if ! rg -q --fixed-strings "ORDER_FORM_SOURCE_REVISION" "$shared_source"; then
  echo "Refusing deployment: shared source lacks its revision marker." >&2
  exit 1
fi

if rg -q --fixed-strings "cqmhanqnfybyxezhobkx" "$repo_dir/supabase/functions"; then
  echo "Refusing deployment: Genie project marker found in order-form functions." >&2
  exit 1
fi

migration_count=0
for migration_file in $migration_glob; do
  if [[ -f "$migration_file" ]]; then
    migration_count=$((migration_count + 1))
  fi
done

if [[ "$migration_count" -ne 1 ]]; then
  echo "Refusing deployment: expected exactly one order-submission reliability migration." >&2
  exit 1
fi

for function_name in "${function_names[@]}"; do
  entrypoint="$repo_dir/supabase/functions/$function_name/index.ts"
  if [[ ! -f "$entrypoint" ]]; then
    echo "Refusing deployment: missing $entrypoint" >&2
    exit 1
  fi

  if ! rg -q --fixed-strings "../_shared/order-submission.ts" "$entrypoint"; then
    echo "Refusing deployment: $function_name does not use the guarded shared contract." >&2
    exit 1
  fi
done

local_source_digest="$(
  {
    for function_name in "${function_names[@]}"; do
      shasum -a 256 "$repo_dir/supabase/functions/$function_name/index.ts"
    done
    shasum -a 256 "$shared_source"
  } | shasum -a 256 | awk '{print $1}'
)"

live_functions_json="$(
  supabase functions list \
    --project-ref "$expected_ref" \
    --output json
)"

read_live_value() {
  local slug="$1"
  local key="$2"

  LIVE_FUNCTIONS_JSON="$live_functions_json" python3 - "$slug" "$key" <<'PY'
import json
import os
import sys

slug = sys.argv[1]
key = sys.argv[2]
functions = json.loads(os.environ["LIVE_FUNCTIONS_JSON"])
match = next((item for item in functions if item.get("slug") == slug), None)
if match is None:
    sys.exit(3)
value = match.get(key)
if isinstance(value, bool):
    print("true" if value else "false")
elif value is not None:
    print(value)
PY
}

live_create_version="$(read_live_value create-xendit-payment version)"
live_verify_version="$(read_live_value verify-xendit-payment version)"
live_create_digest="$(read_live_value create-xendit-payment ezbr_sha256)"
live_verify_digest="$(read_live_value verify-xendit-payment ezbr_sha256)"
live_create_jwt="$(read_live_value create-xendit-payment verify_jwt)"
live_verify_jwt="$(read_live_value verify-xendit-payment verify_jwt)"

if [[ "$live_create_jwt" != "true" || "$live_verify_jwt" != "true" ]]; then
  echo "Refusing deployment: live Cake App payment functions must require JWTs." >&2
  exit 1
fi

baseline_matches="false"
if [[ "$live_create_version" == "$expected_create_version" \
  && "$live_verify_version" == "$expected_verify_version" \
  && "$live_create_digest" == "$expected_create_digest" \
  && "$live_verify_digest" == "$expected_verify_digest" ]]; then
  baseline_matches="true"
fi

echo "Deployment guard passed: Cake App -> $expected_ref"
echo "Local Phase 2 source digest: $local_source_digest"
echo "Live create-xendit-payment: v$live_create_version $live_create_digest"
echo "Live verify-xendit-payment: v$live_verify_version $live_verify_digest"

if [[ "$action" == "--check" ]]; then
  if [[ "$baseline_matches" == "true" ]]; then
    echo "Live source parity: reconciled v26/v24 baseline confirmed."
  else
    echo "Live source parity: baseline has changed; re-reconcile before any cutover." >&2
    exit 1
  fi
  exit 0
fi

if [[ "$baseline_matches" != "true" ]]; then
  echo "Refusing deployment: live v26/v24 source digests changed after reconciliation." >&2
  exit 1
fi

if [[ "${PHASE2_MIGRATION_CONFIRMED:-}" != "$cutover_confirmation" ]]; then
  echo "Refusing deployment: set PHASE2_MIGRATION_CONFIRMED only after the additive migration is applied and verified." >&2
  exit 1
fi

for function_name in "${function_names[@]}"; do
  supabase functions deploy "$function_name" \
    --project-ref "$expected_ref" \
    --workdir "$repo_dir" \
    --use-api \
    --yes
done

post_deploy_json="$(
  supabase functions list \
    --project-ref "$expected_ref" \
    --output json
)"

for function_name in "${function_names[@]}"; do
  post_status="$(
    LIVE_FUNCTIONS_JSON="$post_deploy_json" python3 - "$function_name" <<'PY'
import json
import os
import sys

slug = sys.argv[1]
functions = json.loads(os.environ["LIVE_FUNCTIONS_JSON"])
match = next((item for item in functions if item.get("slug") == slug), None)
if match is None:
    sys.exit(3)
print(f"{match.get('status')}:{str(match.get('verify_jwt')).lower()}")
PY
  )"

  if [[ "$post_status" != "ACTIVE:true" ]]; then
    echo "Deployment verification failed for $function_name: $post_status" >&2
    exit 1
  fi
done

echo "Deployed guarded Phase 2 functions to $expected_ref without pruning."
echo "Audit source digest: $local_source_digest"
