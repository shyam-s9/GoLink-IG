#!/bin/sh
set -eu

resolve_applied_if_needed() {
  migration_name="$1"
  output_file="/tmp/prisma-resolve-applied-${migration_name}.log"

  if npx prisma migrate resolve --applied "$migration_name" >"$output_file" 2>&1; then
    cat "$output_file"
    return 0
  fi

  if grep -qiE 'P3008|already recorded as applied|already applied' "$output_file"; then
    echo "[prisma] migration $migration_name is already marked as applied; continuing"
    return 0
  fi

  cat "$output_file"
  return 1
}

resolve_rolled_back_if_failed() {
  migration_name="$1"
  output_file="/tmp/prisma-resolve-rolledback-${migration_name}.log"

  if npx prisma migrate resolve --rolled-back "$migration_name" >"$output_file" 2>&1; then
    cat "$output_file"
    return 0
  fi

  if grep -qiE 'P3012|not in a failed state|has not failed|is not in a failed state|already recorded as rolled back' "$output_file"; then
    echo "[prisma] migration $migration_name does not need failed-state recovery; continuing"
    return 0
  fi

  cat "$output_file"
  return 1
}

resolve_applied_if_needed "20260404000000_initial_baseline"
resolve_applied_if_needed "20260404120000_align_prisma_role_varchar"
resolve_rolled_back_if_failed "20260404130000_add_platform_config"