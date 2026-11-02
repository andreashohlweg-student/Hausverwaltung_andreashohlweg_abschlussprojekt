CREATE SCHEMA IF NOT EXISTS hausportal;

CREATE TABLE IF NOT EXISTS hausportal.state (
  id integer PRIMARY KEY CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0
);
INSERT INTO hausportal.state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE hausportal.owners (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX owners_email ON hausportal.owners (lower(email));

CREATE TABLE hausportal.properties (
  id text PRIMARY KEY,
  name text NOT NULL,
  street text NOT NULL,
  postal_code text NOT NULL,
  city text NOT NULL,
  units integer NOT NULL CHECK (units BETWEEN 1 AND 100000),
  owner_id text REFERENCES hausportal.owners(id) ON DELETE SET NULL
);

CREATE TABLE hausportal.tenants (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL DEFAULT '',
  property_id text REFERENCES hausportal.properties(id) ON DELETE SET NULL,
  apartment text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX tenants_email ON hausportal.tenants (lower(email));

CREATE TABLE hausportal.employees (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('Verwaltung', 'Buchhaltung', 'Technik', 'Administrator'))
);
CREATE UNIQUE INDEX employees_email ON hausportal.employees (lower(email));

CREATE TABLE hausportal.users (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'owner', 'tenant')),
  active boolean NOT NULL DEFAULT true,
  owner_id text UNIQUE REFERENCES hausportal.owners(id) ON DELETE SET NULL,
  tenant_id text UNIQUE REFERENCES hausportal.tenants(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email ON hausportal.users (lower(email));

CREATE TABLE hausportal.invitations (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'owner', 'tenant')),
  owner_id text REFERENCES hausportal.owners(id) ON DELETE CASCADE,
  tenant_id text REFERENCES hausportal.tenants(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX invitations_pending_email ON hausportal.invitations (lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE TABLE hausportal.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 1
);

CREATE INDEX properties_owner ON hausportal.properties(owner_id);
CREATE INDEX tenants_property ON hausportal.tenants(property_id);
