-- AuditLog append-only enforcement.
--
-- The application code only ever inserts into AuditLog, but a misbehaving
-- service or compromised account with DB credentials should still be unable
-- to tamper with the audit trail. Enforce this at the database so even raw
-- SQL through psql can't UPDATE or DELETE individual rows.
--
-- TRUNCATE is intentionally NOT blocked here: it requires table-level
-- privilege which production app roles don't have, and we still need a way
-- to wipe the table during regulated retention rotations.

CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only — UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON "AuditLog";
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS audit_log_no_delete ON "AuditLog";
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
