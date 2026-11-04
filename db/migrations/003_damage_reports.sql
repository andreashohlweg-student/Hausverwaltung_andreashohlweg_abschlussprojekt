CREATE TABLE hausportal.damages (
  id uuid PRIMARY KEY,
  reporter_id text REFERENCES hausportal.users(id) ON DELETE SET NULL,
  tenant_id text REFERENCES hausportal.tenants(id) ON DELETE SET NULL,
  property_id text REFERENCES hausportal.properties(id) ON DELETE SET NULL,
  unit_id text REFERENCES hausportal.units(id) ON DELETE SET NULL,
  location text NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 6000),
  language text NOT NULL CHECK (language IN ('de','en')),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','in_progress','invoiced','paid')),
  assignee_id text REFERENCES hausportal.users(id) ON DELETE SET NULL,
  service_ordered boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX damages_reporter ON hausportal.damages(reporter_id,created_at DESC);
CREATE INDEX damages_property ON hausportal.damages(property_id,status);
CREATE INDEX damages_status ON hausportal.damages(status,created_at DESC);

CREATE TABLE hausportal.damage_messages (
  id uuid PRIMARY KEY,
  damage_id uuid NOT NULL REFERENCES hausportal.damages(id),
  channel text NOT NULL CHECK (channel IN ('tenant','owner')),
  author_id text REFERENCES hausportal.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  author_role text NOT NULL CHECK (author_role IN ('admin','tenant','owner')),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 6000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX damage_messages_case ON hausportal.damage_messages(damage_id,channel,created_at,id);

CREATE TABLE hausportal.damage_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  damage_id uuid NOT NULL REFERENCES hausportal.damages(id),
  status text NOT NULL CHECK (status IN ('created','in_progress','invoiced','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX damage_events_case ON hausportal.damage_events(damage_id,id);

CREATE SEQUENCE hausportal.damage_invoice_number;
CREATE TABLE hausportal.damage_invoices (
  damage_id uuid PRIMARY KEY REFERENCES hausportal.damages(id),
  number text NOT NULL UNIQUE,
  owner_id text REFERENCES hausportal.owners(id) ON DELETE SET NULL,
  details jsonb NOT NULL,
  pdf bytea NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);
