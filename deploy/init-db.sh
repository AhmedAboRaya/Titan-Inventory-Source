#!/bin/sh
set -eu
app_password=$(cat /run/secrets/inventory_password)
[ "${#app_password}" -ge 24 ] || { echo 'Inventory database secret is too short' >&2; exit 1; }
# psql variables and format(%L) quote the password as a SQL literal; it is never printed.
psql --username "$POSTGRES_USER" --dbname postgres --set ON_ERROR_STOP=1 --set app_password="$app_password" <<'SQL'
SELECT format('CREATE ROLE titan_inventory LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password') \gexec
CREATE DATABASE titan_inventory OWNER titan_inventory;
REVOKE ALL ON DATABASE titan_inventory FROM PUBLIC;
GRANT CONNECT ON DATABASE titan_inventory TO titan_inventory;
SQL
unset app_password
