# PostgreSQL — Create Database, Restore Backup & Grant Access

Instructions to create the `talvax1` database on a PostgreSQL instance,
restore a dev backup into it, and grant the `onsys_online` application user
full access.

---

## Prerequisites

- PostgreSQL 16 installed and running
- Access to the `postgres` superuser (or another superuser account)
- A `.sql` or `.dump` backup file of the dev database

---

## Step 1 — Create the database and application user

Connect as the `postgres` superuser:

```bash
psql -U postgres
```

Create the application user (skip if it already exists):

```sql
CREATE USER onsys_online WITH PASSWORD 'your_strong_password_here';
```

Create the database owned by the application user:

```sql
CREATE DATABASE talvax1 OWNER onsys_online;
```

Exit psql:

```sql
\q
```

---

## Step 2 — Restore the dev database backup

### Option A — Plain SQL dump (`.sql` file)

```bash
psql -U postgres -d talvax1 -f /path/to/backup.sql
```

### Option B — Custom-format dump (`.dump` file, created with `pg_dump -Fc`)

```bash
pg_restore -U postgres -d talvax1 --no-owner --role=onsys_online /path/to/backup.dump
```

The `--no-owner` flag drops ownership statements from the dump so objects
land under the current restore user. `--role=onsys_online` reassigns them
to the application user.

### Option C — Directory-format dump

```bash
pg_restore -U postgres -d talvax1 --no-owner --role=onsys_online -j 4 /path/to/backup_dir/
```

`-j 4` restores with 4 parallel workers — adjust to your CPU count.

---

## Step 3 — Grant the application user full access

Connect to the restored database:

```bash
psql -U postgres -d talvax1
```

Grant schema and object privileges:
```sql
-- Grant connect + schema usage
GRANT CONNECT ON DATABASE telvax1 TO onsys_online;
GRANT USAGE ON SCHEMA public TO onsys_online;

-- Grant on all existing tables, sequences, and functions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO onsys_online;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO onsys_online;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO onsys_online;

-- Ensure future objects (created by migrations) are also accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public   GRANT ALL PRIVILEGES ON TABLES TO onsys_online;

ALTER DEFAULT PRIVILEGES IN SCHEMA public   GRANT ALL PRIVILEGES ON SEQUENCES TO onsys_online;
```

Exit psql:

```sql
\q
```

---

## Step 4 — Update the application connection string

Set `DATABASE_URL` in your environment file (`.env` or `.env.prod`):

```env
DATABASE_URL=postgresql://onsys_online:your_strong_password_here@localhost:5432/talvax1
```

If running inside Docker and the database is on the host machine, replace
`localhost` with `host.docker.internal` (Docker Desktop) or the host's
internal IP.

---

## Step 5 — Verify

Connect as the application user and confirm table access:

```bash
psql -U onsys_online -d talvax1 -c "\dt"
```

You should see the full list of application tables. If Prisma migrations
are used, also confirm the `_prisma_migrations` table is present:

```bash
psql -U onsys_online -d talvax1 -c "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;"
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `role "onsys_online" does not exist` | User not created | Run Step 1 first |
| `database "talvax1" already exists` | DB exists from a prior run | Drop with `DROP DATABASE talvax1;` or skip CREATE |
| `permission denied for table ...` | Grants not applied | Re-run the GRANT statements in Step 3 |
| `pg_restore: error: could not connect` | Wrong host/port | Check `pg_hba.conf` and that PostgreSQL is listening |
| `authentication failed` | Wrong password | Check password matches `DATABASE_URL` |





postgres@au-onsys-online-vm-01:/opt/talvex/app$  pg_restore   -h localhost   -U postgres   -d talvexit01   --clean   --if-exists   --no-owner   --no-privileges  onys_dev_20260506_192028.backup



postgres=# \c talvexit01
psql (17.9 (Ubuntu 17.9-1.pgdg24.04+1), server 16.13 (Ubuntu 16.13-1.pgdg24.04+1))
You are now connected to database "talvexit01" as user "postgres".
talvexit01=# GRANT USAGE ON SCHEMA public TO onsys_online;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO onsys_online;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO onsys_online;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO onsys_online;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO onsys_online;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO onsys_online;
GRANT
GRANT
GRANT
GRANT
ALTER DEFAULT PRIVILEGES
ALTER DEFAULT PRIVILEGES
talvexit01=#
