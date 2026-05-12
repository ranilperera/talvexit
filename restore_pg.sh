#!/usr/bin/env bash
# Usage: ./restore_pg.sh <backup_file> <target_db>
# Example: ./restore_pg.sh onys_dev_backup.sql talvexit01

BACKUP_FILE="${1:-onys_dev_backup.sql}"
TARGET_DB="${2:-talvexit01}"
DB_USER="onsys_online"

echo "==> Dropping and recreating database: $TARGET_DB"
psql -U postgres -c "DROP DATABASE IF EXISTS $TARGET_DB;"
psql -U postgres -c "CREATE DATABASE $TARGET_DB;"

echo "==> Granting CONNECT to $DB_USER"
psql -U postgres -c "GRANT CONNECT ON DATABASE $TARGET_DB TO $DB_USER;"

echo "==> Restoring backup: $BACKUP_FILE -> $TARGET_DB"
pg_restore -U postgres -d "$TARGET_DB" --no-owner --role="$DB_USER" "$BACKUP_FILE"

echo "==> Granting table/sequence/function privileges to $DB_USER"
psql -U postgres -d "$TARGET_DB" -c "
  GRANT USAGE ON SCHEMA public TO $DB_USER;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO $DB_USER;
  GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO $DB_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO $DB_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO $DB_USER;
"

/usr/lib/postgresql/17/bin/pg_restore -U postgres -d talvexit01 --no-owner --role="onsys_online" onys_dev_20260416_155846.backup


echo "==> Done. Database $TARGET_DB is ready."
-- Connect to the talvexit01 database first
\c talvexit01

GRANT USAGE ON SCHEMA public TO onsys_online;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO onsys_online;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO onsys_online;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO onsys_online;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO onsys_online;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO onsys_online;


aDD HBA.CONF 
host    talvexit01    onsys_online    172.16.0.0/12    md5


/usr/lib/postgresql/17/bin/pg_restore --version
/usr/lib/postgresql/17/bin/pg_restore -U postgres -d talvexit01 -v /opt/onsys/onys_dev_20260416_155846.backup

psql -U postgres -d talvexit01 << 'SQL'
GRANT CONNECT ON DATABASE talvexit01 TO onsys_online;
GRANT USAGE ON SCHEMA public TO onsys_online;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA public TO onsys_online;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO onsys_online;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO onsys_online;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO onsys_online;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO onsys_online;
SQL
