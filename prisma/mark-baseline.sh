#!/bin/sh
set -eu

resolve_if_needed() {
  migration_name="$1"
  output_file="/tmp/prisma-resolve-${migration_name}.log"

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

resolve_if_needed "20260404000000_initial_baseline"
resolve_if_needed "20260404120000_align_prisma_role_varchar"
