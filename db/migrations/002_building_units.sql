-- Use the same lock order as application writes.
SELECT revision FROM hausportal.state WHERE id = 1 FOR UPDATE;

CREATE TABLE hausportal.units (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  property_id text NOT NULL REFERENCES hausportal.properties(id) ON DELETE CASCADE,
  name_key text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  UNIQUE (property_id, name_key) DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE hausportal.tenants
  ADD COLUMN unit_id text REFERENCES hausportal.units(id) ON DELETE SET NULL,
  ADD CONSTRAINT tenant_assignment_source CHECK (unit_id IS NULL OR property_id IS NULL);
CREATE INDEX tenants_unit ON hausportal.tenants(unit_id);

-- An existing apartment label identifies a unit only within its own building.
INSERT INTO hausportal.units (id, name, property_id)
SELECT gen_random_uuid()::text, min(btrim(apartment)), property_id
FROM hausportal.tenants
WHERE property_id IS NOT NULL AND btrim(apartment) <> ''
GROUP BY property_id, lower(btrim(apartment));

UPDATE hausportal.tenants t
SET unit_id = u.id, property_id = NULL
FROM hausportal.units u
WHERE u.property_id = t.property_id AND u.name_key = lower(btrim(t.apartment));

-- Retain the previously recorded counts and labels during the rollout.
ALTER TABLE hausportal.properties ALTER COLUMN units SET DEFAULT 1;
UPDATE hausportal.state SET revision = revision + 1 WHERE id = 1;
