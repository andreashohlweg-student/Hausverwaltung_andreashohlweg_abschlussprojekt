-- A case has its own owner assignment. Building ownership is only the initial default.
SELECT revision FROM hausportal.state WHERE id = 1 FOR UPDATE;

CREATE TABLE hausportal.damage_owner_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  damage_id uuid NOT NULL REFERENCES hausportal.damages(id),
  owner_id text REFERENCES hausportal.owners(id) ON DELETE SET NULL,
  owner_name text NOT NULL CHECK (btrim(owner_name) <> ''),
  assigned_by text REFERENCES hausportal.users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('migration','report','manual')),
  ended_at timestamptz,
  ended_by text REFERENCES hausportal.users(id) ON DELETE SET NULL,
  end_reason text CHECK (end_reason IN ('reassigned','unassigned','building_owner_changed','owner_removed')),
  CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);
CREATE UNIQUE INDEX damage_owner_assignment_current
  ON hausportal.damage_owner_assignments(damage_id) WHERE ended_at IS NULL;
CREATE INDEX damage_owner_assignment_owner ON hausportal.damage_owner_assignments(owner_id);
CREATE INDEX damage_owner_assignment_history ON hausportal.damage_owner_assignments(damage_id,id);

-- Preserve the access that existed at migration time. Do not invent earlier history.
INSERT INTO hausportal.damage_owner_assignments(damage_id,owner_id,owner_name,source)
SELECT d.id,o.id,o.name,'migration'
FROM hausportal.damages d
LEFT JOIN hausportal.properties p ON p.id=d.property_id
LEFT JOIN hausportal.damage_invoices i ON i.damage_id=d.id
JOIN hausportal.owners o ON o.id=CASE WHEN i.damage_id IS NOT NULL THEN i.owner_id ELSE p.owner_id END;

ALTER TABLE hausportal.damage_events
  ADD COLUMN actor_id text REFERENCES hausportal.users(id) ON DELETE SET NULL,
  ADD COLUMN actor_name text;
ALTER TABLE hausportal.damages ADD CONSTRAINT damage_positive_version CHECK (version > 0);

-- A queryable case/user relation. It is derived, so no parallel ACL needs synchronizing.
CREATE VIEW hausportal.damage_participants AS
SELECT d.id AS damage_id,u.id AS user_id,'tenant'::text AS participation
FROM hausportal.damages d JOIN hausportal.users u ON u.id=d.reporter_id AND u.role='tenant'
UNION ALL
SELECT a.damage_id,u.id,'owner'::text
FROM hausportal.damage_owner_assignments a
JOIN hausportal.users u ON u.owner_id=a.owner_id AND u.role='owner'
LEFT JOIN hausportal.damage_invoices i ON i.damage_id=a.damage_id
WHERE a.ended_at IS NULL AND (i.damage_id IS NULL OR i.owner_id=a.owner_id)
UNION ALL
SELECT d.id,u.id,'assignee'::text
FROM hausportal.damages d JOIN hausportal.users u ON u.id=d.assignee_id AND u.role='admin';

-- The only read-access rule for case lists, details, messages and PDFs.
CREATE VIEW hausportal.damage_access AS
SELECT d.id AS damage_id,u.id AS user_id,true AS can_manage,
       ARRAY['tenant','owner']::text[] AS message_channels,
       (d.status IN ('invoiced','paid')) AS can_read_invoice
FROM hausportal.damages d CROSS JOIN hausportal.users u
WHERE u.active AND u.role='admin'
UNION ALL
SELECT p.damage_id,p.user_id,false,ARRAY[p.participation]::text[],
       (p.participation='owner' AND d.status IN ('invoiced','paid'))
FROM hausportal.damage_participants p
JOIN hausportal.users u ON u.id=p.user_id AND u.active
JOIN hausportal.damages d ON d.id=p.damage_id
WHERE p.participation='tenant' OR (p.participation='owner' AND d.status<>'created');

-- A single read model for provisional building assignments and actual apartments.
CREATE VIEW hausportal.tenant_assignments AS
SELECT t.id AS tenant_id,coalesce(u.property_id,t.property_id) AS property_id,
       u.id AS unit_id,u.name AS unit_name
FROM hausportal.tenants t LEFT JOIN hausportal.units u ON u.id=t.unit_id;

ALTER TABLE hausportal.users ADD CONSTRAINT user_role_contact CHECK (
  (role='admin' AND owner_id IS NULL AND tenant_id IS NULL) OR
  (role='owner' AND tenant_id IS NULL AND (owner_id IS NOT NULL OR NOT active)) OR
  (role='tenant' AND owner_id IS NULL AND (tenant_id IS NOT NULL OR NOT active))
);
ALTER TABLE hausportal.invitations ADD CONSTRAINT invitation_role_contact CHECK (
  (role='admin' AND owner_id IS NULL AND tenant_id IS NULL) OR
  (role='owner' AND owner_id IS NOT NULL AND tenant_id IS NULL) OR
  (role='tenant' AND tenant_id IS NOT NULL AND owner_id IS NULL)
);
UPDATE hausportal.state SET revision=revision+1 WHERE id=1;
