# TITAN INVENTORY — Developer source handoff

Prepared: 2026-10-22 (Africa/Cairo).

This ZIP contains the local Inventory web frontend, backend, SQL migration,
deployment templates, tests, and technical documentation. It is a source-only
snapshot of modules/inventory. The central Titan launcher, game, avatars, other
departments, and Android/native project are NOT included.

The existing optional Titan bridge/navigation references remain unchanged in
Inventory source. Packaging does not redesign those integration points or create
a separate Android APK. The web/backend project builds from its own package.json.

## Main folders
- src/: React web UI, client session, offline behavior.
- server/: API, authorization, catalogue, ledger, workflows, attachments.
- migrations/: database schema.
- public/: static Inventory assets.
- deploy/: Dockerfile, Compose templates, backup/maintenance tooling.
- tests/: development tests and synthetic fixtures (not production accounts).
- docs/: architecture, permissions, synchronization, and other technical notes.

## Development
Use Node.js 24.x and npm. From this directory:
    npm ci
    npm run build
    npm test

Read deploy/README.md for database, secret files, origin, reverse proxy, and
deployment requirements. npm run dev serves only the frontend and proxies
/inventory/v1 to a separately running local API. The default URL prefix is
/inventory/. Compose templates do not expose the API publicly by themselves.
Do not point development writes at the production database.

## Snapshot and production scope
This includes the October 20 import-review UI and import-metadata preservation
fixes in Operations.tsx and Catalogue.tsx. Documentation may describe earlier
verification stages; those notes are historical, not a current production audit.
No deployment or database operation was performed while making this ZIP.

## Excluded intentionally
Production database and balances, import source documents and review reports,
attachments, account/session data, .env files, secret files, signing keys,
backups, local runtimes, node_modules, generated dist output, and APKs.
The real stock data remains on the existing server. Developers should use a
separate test database and their own development credentials.

Before publishing on GitHub, keep it private unless the owner authorizes a public
release; review any new files and repository history for private data/secrets.
This source ZIP is not a database backup or a ready-to-install application.

SOURCE-MANIFEST.json records SHA-256 hashes of every original source file in
this archive. The original project files were not modified.
