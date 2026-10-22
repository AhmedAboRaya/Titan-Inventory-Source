# Inventory deployment and recovery

This is a **new, independent Inventory database and service**. It does not import, alter, or share the four existing departments' tables or accounts. No business balances or administrator credentials are seeded by startup. The central `modules/inventory` source is authoritative.

## Verified and pending

- PostgreSQL 17.11 was tested locally using separate real connections and synthetic data. See `../docs/postgres-test-results.json` and `../tests/postgres.integration.ts` for the exact current result.
- The backup tool was tested with a consistent exported snapshot, a real custom-format dump, attachment SHA-256 validation, and restoration into a new isolated database with matching table fingerprints. Tampered attachments and an existing backup destination were rejected.
- Docker/Compose has not been executed on this workstation: Docker is unavailable. The NAS operator built and started `titan-inventory:0.1.0-titan050-r2`. The read-only live check in `../../../review/nas-inventory-readonly-r2.json` passed: PostgreSQL ready, 35 public tables, schema migration 1, reference roles/categories seeded, no users or business records, and setup not initialized. The served frontend and compiled exports matched the frozen release hashes. This confirms internal service startup; public routing, user setup/login, physical-device acceptance, and a live operator backup remain separate checks.
- The native/Web passkey experience and physical-device acceptance remain separate checks; no real account or production database was used in these tests.

## Images and private topology

`Dockerfile` pins official Node 24 Bookworm Slim and PostgreSQL 17.11 Bookworm multi-platform image digests. Source image publishers: [Node official image](https://hub.docker.com/_/node), [PostgreSQL official image](https://hub.docker.com/_/postgres). Local Windows PostgreSQL test tooling was obtained through the [PostgreSQL Windows downloads](https://www.postgresql.org/download/windows/) / [EDB binaries](https://www.enterprisedb.com/download-postgresql-binaries) chain; the download metadata and SHA are recorded by `tests/download-postgres.py`.

`compose.yaml` publishes **no host port**. PostgreSQL joins only the project's internal private network. Inventory API joins that private network and one named internal gateway network, created and owned by this new Inventory project (`titan-inventory-proxy` by default). Only the existing HTTPS gateway and Inventory API should join the gateway network; PostgreSQL must not join it. The gateway upstream is `http://titan-inventory-api:8080/inventory/`.

The existing gateway should proxy `/inventory/` while preserving that prefix and the request's path/query, methods, cookie, Origin, CSRF token, and idempotency key. Use the approved origin `https://titanindustries.synology.me:7447` as `PUBLIC_ORIGIN` if this is the final endpoint. Do not rewrite Origin to a trusted value. Preserve `Set-Cookie` and API `Cache-Control: no-store`. The Inventory service worker is scoped to `/inventory/` and only caches its allowlisted static shell; an older root service worker must bypass this prefix. WebAuthn validates the configured exact origin (including HTTPS port) and the hostname RP ID.

An optional `compose.loopback.yaml` adds a NAS-loopback-only API port for a local operator. It is unnecessary with the container gateway network. A loopback port in the NAS host is not the loopback interface inside Injection's container.

## Prepare and build

1. Review fresh current gateway source and deployment settings, and back them up before adding the route/network. Keep existing ports, volumes, credentials, and department URLs unchanged.
2. In `deploy`, create a private `.secrets` directory and three different randomly generated secrets, each at least 32 bytes of entropy: `postgres_password.txt`, `inventory_password.txt`, and the one-time first-administrator setup token `inventory_setup.txt`. These files, `.env`, and backups are ignored by Git and must never enter the ZIP of public assets, repository, or logs. Use a password manager or generate directly into files; do not print the database passwords. Protect the parent directory with owner-only host access. Docker secret mounts supply the values to containers. The setup token is an operator credential, shared privately only with the user who will initialize Inventory; it is not bundled in the frontend/APK.
3. Set nonsecret Compose variables in a local environment file: an immutable `INVENTORY_IMAGE_TAG`, approved `PUBLIC_ORIGIN`, and `INVENTORY_GATEWAY_NETWORK`. Review `docker compose config --quiet` using the actual NAS Compose version before any start.
4. Confirm the dedicated gateway network name does not collide with an unrelated existing network. Start Inventory first to create its named internal gateway network, then attach the existing HTTPS gateway to that network as an external network through its reviewed deployment configuration, in addition to the gateway's original network. Do not attach PostgreSQL to it. Preserve the existing gateway's original default network for any required outbound access.
5. Create `deploy/backups` as a private directory writable by UID/GID `1000:1000`; the maintenance container runs with that identity. Keep backups on encrypted storage with restricted access and an independent off-device copy.
6. Build and start only the new service: `docker compose build api`, then `docker compose up -d db api`. Check DB/API health and logs. Startup applies the fresh Inventory schema and reference categories/roles, not stock quantities. Do not use `down -v` in release/rollback procedures.
7. The user initializes the first administrator through the setup screen with the private setup token and credentials they choose. The server checks only a hash of the mounted token and atomically refuses setup once any user exists; it cannot reset existing accounts. Alternatively, an authorized operator may run `docker compose exec api node entrypoint.cjs bootstrap` in a private interactive terminal; the password prompt is hidden and credentials are supplied on standard input, never as command arguments. No default production username or password is supplied.
8. Verify unauthenticated status, scoped login/session, the four original modules, and Inventory's own permissions, then perform the agreed real-device acceptance. Public release must not be claimed until these checks pass.

`init-db.sh` runs only when PostgreSQL initializes an empty named volume. It creates a separate nonsuperuser, non-createdb, non-createrole application login. API startup uses only that login. Existing-volume password rotation requires an explicit database role/password and secret-file rotation procedure; replacing a file alone is insufficient.

The NAS release `0.1.0-titan050-r2` preserves the existing database secret exactly as `init-db.sh` interprets it: shell command substitution removes trailing LF bytes but retains CR and spaces. API, maintenance, and the read-only release check use the same convention. This matters for a secret file written with Windows CRLF: trimming all whitespace would authenticate with a different password. Do not normalize or rewrite an existing secret file to fix that mismatch. The first-administrator setup token has a separate unchanged trimming/hash convention. The source Compose template still requires `INVENTORY_IMAGE_TAG`; use `0.1.0-titan050-r2` for this release.

The default limits reflect the NAS's 4 GiB RAM: API 512 MiB with a 320 MiB V8 heap, DB 384 MiB with 96 MiB shared buffers and 30 connections, and the optional backup tool 512 MiB. Logs rotate at 10 MiB, three files for persistent services. Build and verify one image at a time on the NAS, monitor actual memory/health, and avoid overlapping image builds and operator backups. Compose runtime limits do not automatically limit Docker's build process.

The actual NAS kernel rejected CPU CFS quotas (`NanoCPUs`), so services use `cpu_shares: 512`, a relative scheduling weight rather than a hard CPU limit. It also reported that PIDs limits are unsupported and discarded; the configured `pids_limit` must not be treated as enforced on that host. Keep all comma-separated tmpfs options inside a single quoted YAML string. An unquoted flow-list value splits those options into separate mounts.

## Consistent backup

Build the separate maintenance target: `docker compose --profile maintenance build backup`.

Run an operator backup with a **new** name, for example:

```sh
docker compose --profile maintenance run --rm backup backup inventory-20261018T220000Z
```

The tool connects only to the new Inventory DB using its mounted application secret. It starts a read-only repeatable-read transaction, exports that snapshot to `pg_dump`, reads the attachment references and table fingerprints from the same snapshot, and copies the immutable content-addressed files. It verifies original-file SHA-256 and records thumbnail hashes. It atomically renames the completed directory only after the dump and attachments are present. Existing backup directories are never overwritten; incomplete attempts retain an `.incomplete-...` suffix and must not be treated as successful backups. Output contains only status, location, file counts, and a dump hash, never rows or credentials.

Each completed directory contains `database.dump`, `manifest.json`, and `attachments/`. It includes account hashes, sessions, passkeys, audit history, and business data, so it is sensitive. Keep at least the last known good backup before each release and follow the user's retention policy. No scheduled job is installed by these files.

For a workstation operator with Node24, this module's dependencies, and matching PostgreSQL17 client tools, `backup.cjs` also supports:

```sh
node deploy/backup.cjs backup --output /private/new-backup --attachments /private/inventory-attachments
```

Supply `DATABASE_URL` and `PG_BIN` privately in the process environment, never in shell history or public files. The container maintenance command avoids having to expose PostgreSQL on the host.

## Restore verification and recovery

Use `backup.cjs restore-check` against a separately created **loopback** test cluster. Supply `INVENTORY_RESTORE_TEST_URL` targeting `/postgres` and `PG_BIN` privately:

```sh
node deploy/backup.cjs restore-check --directory /private/completed-backup
```

The helper refuses a non-loopback URL or a URL for an application database. It validates the dump and attachment hashes, creates a randomly named fresh database, restores in one transaction, compares every public table's count and row fingerprint, and drops only that newly created verification database. It never restores over an existing database. The verification DB needs a local test administrator with CREATEDB; the production application user intentionally does not have it.

For actual recovery, first stop Inventory writes, preserve a snapshot of the failed state, and restore the reviewed backup into a **new** empty database/volume with PostgreSQL17. Restore `attachments/` to a new corresponding files volume, preserve private permissions, then verify hashes, integrity, schema, accounts/permissions, row fingerprints, and representative operations before switching the API to the recovered volumes. Revoke recovered sessions before reopening if the restored state predates a security-related revocation. Do not overwrite current volumes or the four original departments as a shortcut. The helper deliberately does not automate this destructive production switch.

## Updating and rollback

Build each release under a new immutable image tag, preserve the previous image and deployment file, and take/verify a backup first. Review every future numbered migration for compatibility and data retention. The current initial schema is intended for a fresh Inventory database, not modification of another department's schema. A code rollback is safe only when its schema remains compatible; otherwise recover into new verified volumes. Gateway rollback removes only the new Inventory route/network attachment and restores the exact prior gateway configuration. Never remove named data volumes to roll back code.
