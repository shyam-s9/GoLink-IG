# Prisma Baseline Validation Notes

Validated against the current boot-time compatibility logic in `server.js` and the baseline migration under `prisma/migrations/20260404000000_initial_baseline`.

Confirmed alignments:
- `Users.role` is stored as `VARCHAR`, not a PostgreSQL enum.
- `Users.token_expires_at` exists and should remain nullable.
- `Reels_Automation.user_id` is nullable in legacy environments.
- Security/audit/session tables and indexes match the baseline migration.

Assumptions:
- This validation was done against the code-defined schema and migration artifacts in the repository, not by live introspection against production PostgreSQL.
- If production contains drift outside the known legacy rename paths in `server.js`, a follow-up introspection and corrective migration may still be required.
- `schema.sql` is treated as historical reference only and not as the Prisma source of truth.
