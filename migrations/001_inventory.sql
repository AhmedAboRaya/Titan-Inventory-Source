CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS settings(key text PRIMARY KEY, value jsonb NOT NULL);
INSERT INTO settings VALUES ('instance',jsonb_build_object('id',gen_random_uuid(),'currency','EGP','timezone','Africa/Cairo')) ON CONFLICT DO NOTHING;
CREATE TABLE roles(id text PRIMARY KEY, name text NOT NULL, permissions text[] NOT NULL);
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), username text NOT NULL UNIQUE, display_name text NOT NULL,
 password_hash text NOT NULL, role_id text NOT NULL REFERENCES roles, warehouse_ids uuid[] NOT NULL DEFAULT '{}', department_ids uuid[] NOT NULL DEFAULT '{}',
 all_warehouses boolean NOT NULL DEFAULT false, all_departments boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sessions(token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, csrf text NOT NULL, device text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked boolean NOT NULL DEFAULT false, verified_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE login_attempts(key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL);
CREATE TABLE passkeys(id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users, public_key bytea NOT NULL, counter bigint NOT NULL, transports text[] NOT NULL DEFAULT '{}');
CREATE TABLE challenges(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users, kind text NOT NULL, challenge text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE masters(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK(kind IN ('site','department','employee','machine','supplier')), name text NOT NULL,
 data jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1);
CREATE TABLE warehouses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, site_id uuid REFERENCES masters, active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1);
CREATE TABLE locations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), warehouse_id uuid NOT NULL REFERENCES warehouses, name text NOT NULL, rack text NOT NULL DEFAULT '', shelf text NOT NULL DEFAULT '', bin text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true, UNIQUE(warehouse_id,name));
CREATE TABLE categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_id uuid REFERENCES categories, name_ar text NOT NULL, name_en text NOT NULL,
 illustration text NOT NULL, sort integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1);
CREATE TABLE items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE, name_ar text NOT NULL, name_en text NOT NULL DEFAULT '',
 category_id uuid NOT NULL REFERENCES categories, description text NOT NULL DEFAULT '', brand text NOT NULL DEFAULT '', specification text NOT NULL DEFAULT '',
 base_unit text NOT NULL CHECK(base_unit IN ('Piece','Kg','Gram','Liter','Meter','Roll','Bag','Bottle','Box','Set','Bar')), precision integer NOT NULL CHECK(precision BETWEEN 0 AND 6),
 tracking text NOT NULL CHECK(tracking IN ('consumable','custody','asset')), track_lot boolean NOT NULL DEFAULT false, track_serial boolean NOT NULL DEFAULT false, track_expiry boolean NOT NULL DEFAULT false,
 data jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE item_codes(item_id uuid NOT NULL REFERENCES items, code text NOT NULL, kind text NOT NULL, supplier_id uuid REFERENCES masters, PRIMARY KEY(item_id,code,kind));
CREATE TABLE conversions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES items, unit text NOT NULL, factor numeric(24,9) NOT NULL CHECK(factor>0), approved_by uuid NOT NULL REFERENCES users, UNIQUE(item_id,unit));
CREATE TABLE item_levels(item_id uuid NOT NULL REFERENCES items, warehouse_id uuid NOT NULL REFERENCES warehouses, minimum numeric(24,6) NOT NULL DEFAULT 0 CHECK(minimum>=0), reorder numeric(24,6) NOT NULL DEFAULT 0 CHECK(reorder>=0), target numeric(24,6) NOT NULL DEFAULT 0 CHECK(target>=0), PRIMARY KEY(item_id,warehouse_id));
CREATE TABLE lots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES items, code text NOT NULL, supplier_id uuid REFERENCES masters, manufactured_on date, received_on date NOT NULL DEFAULT CURRENT_DATE, expires_on date, notes text NOT NULL DEFAULT '', UNIQUE(item_id,code));
CREATE TABLE serials(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid NOT NULL REFERENCES items, serial text NOT NULL, UNIQUE(item_id,serial));
CREATE TABLE documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number bigint GENERATED ALWAYS AS IDENTITY UNIQUE, type text NOT NULL,
 status text NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Submitted','Pending Approval','Posted','Rejected','Cancelled','Reversed')),
 document_date date NOT NULL, warehouse_id uuid NOT NULL REFERENCES warehouses, destination_warehouse_id uuid REFERENCES warehouses,
 department_id uuid REFERENCES masters, recipient_id uuid REFERENCES masters, machine_id uuid REFERENCES masters, supplier_id uuid REFERENCES masters,
 reference_id uuid REFERENCES documents, reason text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', currency text NOT NULL DEFAULT 'EGP', exchange_rate numeric(24,9) NOT NULL DEFAULT 1 CHECK(exchange_rate>0),
 created_by uuid NOT NULL REFERENCES users, approved_by uuid REFERENCES users, created_at timestamptz NOT NULL DEFAULT now(), posted_at timestamptz,
 version integer NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}');
CREATE TABLE document_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents, item_id uuid NOT NULL REFERENCES items,
 quantity numeric(24,6) NOT NULL CHECK(quantity>0), unit text NOT NULL, factor numeric(24,9) NOT NULL CHECK(factor>0), base_quantity numeric(24,6) NOT NULL CHECK(base_quantity>0),
 location_id uuid REFERENCES locations, destination_location_id uuid REFERENCES locations, lot_id uuid REFERENCES lots, serial_id uuid REFERENCES serials,
 quality text NOT NULL CHECK(quality IN ('Accepted','Under Inspection','Rejected','Blocked')), condition text NOT NULL DEFAULT 'New' CHECK(condition IN ('New','Used','Repair','Damaged')),
 destination_quality text, unit_cost numeric(24,9) CHECK(unit_cost>=0), posted_unit_cost numeric(24,9), reference_line_id uuid REFERENCES document_lines,
 notes text NOT NULL DEFAULT '');
CREATE TABLE balances(position_key text PRIMARY KEY, item_id uuid NOT NULL REFERENCES items, warehouse_id uuid NOT NULL REFERENCES warehouses, location_id uuid REFERENCES locations,
 lot_id uuid REFERENCES lots, serial_id uuid REFERENCES serials, quality text NOT NULL, condition text NOT NULL, holder_id uuid REFERENCES masters, transit_id uuid REFERENCES documents,
 quantity numeric(24,6) NOT NULL DEFAULT 0 CHECK(quantity>=0), reserved numeric(24,6) NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=quantity));
CREATE INDEX balance_scope ON balances(warehouse_id,item_id);
CREATE TABLE costs(item_id uuid PRIMARY KEY REFERENCES items, quantity numeric(24,6) NOT NULL DEFAULT 0 CHECK(quantity>=0), value numeric(30,9) NOT NULL DEFAULT 0 CHECK(value>=0), unpriced_quantity numeric(24,6) NOT NULL DEFAULT 0 CHECK(unpriced_quantity>=0 AND unpriced_quantity<=quantity), last_price numeric(24,9));
CREATE TABLE ledger(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, document_id uuid NOT NULL REFERENCES documents, line_id uuid NOT NULL REFERENCES document_lines,
 position_key text NOT NULL REFERENCES balances, quantity numeric(24,6) NOT NULL, unit_cost numeric(24,9), posted_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE reservations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents, line_id uuid NOT NULL REFERENCES document_lines,
 position_key text NOT NULL REFERENCES balances, quantity numeric(24,6) NOT NULL CHECK(quantity>0), remaining numeric(24,6) NOT NULL CHECK(remaining>=0), expires_at timestamptz);
CREATE TABLE custody(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), document_id uuid NOT NULL REFERENCES documents, line_id uuid NOT NULL REFERENCES document_lines,
 holder_id uuid NOT NULL REFERENCES masters, quantity numeric(24,6) NOT NULL, returned numeric(24,6) NOT NULL DEFAULT 0 CHECK(returned>=0 AND returned<=quantity), due_on date, state text NOT NULL DEFAULT 'Held');
CREATE TABLE purchase_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id uuid NOT NULL REFERENCES masters, warehouse_id uuid NOT NULL REFERENCES warehouses,
 status text NOT NULL DEFAULT 'Draft', currency text NOT NULL DEFAULT 'EGP', expected_on date, created_by uuid NOT NULL REFERENCES users, version integer NOT NULL DEFAULT 1, data jsonb NOT NULL DEFAULT '{}');
CREATE TABLE purchase_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES purchase_orders, item_id uuid NOT NULL REFERENCES items,
 quantity numeric(24,6) NOT NULL CHECK(quantity>0), unit text NOT NULL, unit_price numeric(24,9) CHECK(unit_price>=0), received numeric(24,6) NOT NULL DEFAULT 0 CHECK(received>=0 AND received<=quantity));
CREATE TABLE inventory_counts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), warehouse_id uuid NOT NULL REFERENCES warehouses, status text NOT NULL DEFAULT 'Open', created_by uuid NOT NULL REFERENCES users,
 created_at timestamptz NOT NULL DEFAULT now(), approved_by uuid REFERENCES users, document_id uuid REFERENCES documents, reason text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1);
CREATE UNIQUE INDEX one_open_count ON inventory_counts(warehouse_id) WHERE status IN ('Open','Pending Approval');
CREATE TABLE count_lines(count_id uuid NOT NULL REFERENCES inventory_counts, position_key text NOT NULL REFERENCES balances, expected numeric(24,6) NOT NULL, counted numeric(24,6), recounted numeric(24,6), PRIMARY KEY(count_id,position_key));
ALTER TABLE inventory_counts ADD COLUMN document_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE document_lines ADD COLUMN purchase_line_id uuid REFERENCES purchase_lines;
ALTER TABLE document_lines ADD COLUMN posted_value numeric(30,9);
ALTER TABLE document_lines ADD COLUMN posted_unpriced_quantity numeric(24,6);
CREATE TABLE attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_id uuid REFERENCES items, document_id uuid REFERENCES documents, warehouse_id uuid REFERENCES warehouses,
 owner_id uuid NOT NULL REFERENCES users, filename text NOT NULL, mime text NOT NULL, bytes bigint NOT NULL, sha256 text NOT NULL, path text NOT NULL, primary_image boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE imports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid NOT NULL REFERENCES users, source text NOT NULL, status text NOT NULL DEFAULT 'Preview', rows jsonb NOT NULL, approved_by uuid REFERENCES users, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, user_id uuid REFERENCES users, action text NOT NULL, target text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', at timestamptz NOT NULL DEFAULT now());
CREATE TABLE idempotency(user_id uuid NOT NULL REFERENCES users, key uuid NOT NULL, fingerprint text NOT NULL, authorization_hash text NOT NULL, response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,key));
CREATE TABLE changes(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, entity text NOT NULL, entity_id text NOT NULL, warehouse_id uuid REFERENCES warehouses, at timestamptz NOT NULL DEFAULT now());
CREATE TABLE jobs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, status text NOT NULL DEFAULT 'Pending', payload jsonb NOT NULL, attempts integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), error text);
CREATE FUNCTION reject_ledger_changes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ledger is append-only'; END $$;
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON ledger FOR EACH ROW EXECUTE FUNCTION reject_ledger_changes();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit FOR EACH ROW EXECUTE FUNCTION reject_ledger_changes();
CREATE FUNCTION protect_posted_document() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('Posted','Reversed') AND NOT (OLD.status='Posted' AND NEW.status='Reversed' AND (to_jsonb(NEW)-'status'-'version')=(to_jsonb(OLD)-'status'-'version')) THEN RAISE EXCEPTION 'posted document is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER posted_document BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION protect_posted_document();
CREATE FUNCTION protect_posted_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM documents WHERE id=OLD.document_id AND status IN ('Posted','Reversed')) THEN RAISE EXCEPTION 'posted lines are immutable'; END IF; RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER posted_lines BEFORE UPDATE OR DELETE ON document_lines FOR EACH ROW EXECUTE FUNCTION protect_posted_line();
CREATE FUNCTION prevent_posted_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF EXISTS(SELECT 1 FROM documents WHERE id=NEW.document_id AND status IN ('Posted','Reversed')) THEN RAISE EXCEPTION 'posted lines are immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER posted_line_insert BEFORE INSERT ON document_lines FOR EACH ROW EXECUTE FUNCTION prevent_posted_insert();
CREATE FUNCTION prevent_posted_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('Posted','Reversed') THEN RAISE EXCEPTION 'posted document is immutable'; END IF; RETURN OLD;
END $$;
CREATE TRIGGER posted_document_delete BEFORE DELETE ON documents FOR EACH ROW EXECUTE FUNCTION prevent_posted_delete();
INSERT INTO schema_migrations(version) VALUES(1);
