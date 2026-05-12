-- Drop the legacy CustomerProfile.abn column.
--
-- ABN data has lived on User (with abn_verified*, abn_verified_name) since
-- the multi-entity refactor; CustomerProfile.abn was never updated by any
-- code path and was a stale duplicate. Removing it eliminates the source
-- of confusion about "which abn is canonical".

ALTER TABLE "CustomerProfile" DROP COLUMN IF EXISTS "abn";
