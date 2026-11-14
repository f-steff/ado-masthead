#!/usr/bin/env bash
# One-time administrator setup for a Masthead YAML pipeline.
#
# This script creates the pipeline definition from an existing trusted
# repository and YAML path. It does not create or modify the YAML file itself.
# Copy ado-pipelines/review.yml or review-native.yml into that repository first.
#
# Required:
#   AZDO_ORG          Organization URL, for example https://dev.azure.com/contoso
#   AZDO_PROJECT      Project containing the trusted pipeline repository
#   PIPELINE_REPO     Trusted repository name
#   PIPELINE_NAME     Pipeline definition name, for example "Masthead review"
#   PIPELINE_YAML     Absolute YAML path, for example /ado-pipelines/review.yml
#
# Optional:
#   PIPELINE_BRANCH   Branch or tag, default refs/heads/main
#   PIPELINE_FOLDER   Pipeline folder, default Masthead
set -euo pipefail

: "${AZDO_ORG:?Set AZDO_ORG}"
: "${AZDO_PROJECT:?Set AZDO_PROJECT}"
: "${PIPELINE_REPO:?Set PIPELINE_REPO}"
: "${PIPELINE_NAME:?Set PIPELINE_NAME}"
: "${PIPELINE_YAML:?Set PIPELINE_YAML}"
PIPELINE_BRANCH="${PIPELINE_BRANCH:-refs/heads/main}"
PIPELINE_FOLDER="${PIPELINE_FOLDER:-Masthead}"

case "$PIPELINE_YAML" in
  /*) ;;
  *) echo "PIPELINE_YAML must be an absolute path such as /ado-pipelines/review.yml." >&2; exit 1 ;;
esac

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI is required: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

if ! az extension show --name azure-devops >/dev/null 2>&1; then
  echo "Install the Azure DevOps CLI extension: az extension add --name azure-devops" >&2
  exit 1
fi

az devops configure --defaults organization="$AZDO_ORG" project="$AZDO_PROJECT" >/dev/null

if ! az repos show --repository "$PIPELINE_REPO" --project "$AZDO_PROJECT" >/dev/null 2>&1; then
  echo "Repository $PIPELINE_REPO was not found in $AZDO_PROJECT." >&2
  echo "Create it, copy the Masthead YAML into it, then run this script again." >&2
  exit 1
fi

if az pipelines show --name "$PIPELINE_NAME" --project "$AZDO_PROJECT" >/dev/null 2>&1; then
  echo "Pipeline $PIPELINE_NAME already exists. Edit it in Azure Pipelines instead of creating a duplicate." >&2
  exit 1
fi

az pipelines create \
  --name "$PIPELINE_NAME" \
  --project "$AZDO_PROJECT" \
  --repository "$PIPELINE_REPO" \
  --repository-type tfsgit \
  --branch "$PIPELINE_BRANCH" \
  --yaml-path "$PIPELINE_YAML" \
  --folder-path "$PIPELINE_FOLDER" \
  --skip-first-run \
  --output table

cat <<'EOF'

Pipeline created. Next:
1. Open the pipeline and authorize the masthead-secrets variable group.
2. Bind the pipeline in Masthead organization Setup.
3. Create the project service hooks from Setup, or manually.
4. Run once manually with targetProject, targetRepository and pullRequestId.
EOF
