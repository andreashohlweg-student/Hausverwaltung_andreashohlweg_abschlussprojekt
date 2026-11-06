SELECT revision FROM hausportal.state WHERE id=1 FOR UPDATE;

-- A live unit reference must belong to the case's building. Historical location
-- text remains unchanged when either record is deleted.
ALTER TABLE hausportal.units ADD CONSTRAINT unit_id_property UNIQUE(id,property_id);
ALTER TABLE hausportal.damages ADD CONSTRAINT damage_unit_building
  FOREIGN KEY(unit_id,property_id) REFERENCES hausportal.units(id,property_id)
  ON UPDATE RESTRICT ON DELETE SET NULL (unit_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE hausportal.invitations ADD CONSTRAINT invitation_creator
  FOREIGN KEY(created_by) REFERENCES hausportal.users(id) ON DELETE SET NULL;
CREATE INDEX damages_assignee ON hausportal.damages(assignee_id);

COMMENT ON COLUMN hausportal.properties.owner_id IS 'Current building owner; does not grant access to existing cases.';
COMMENT ON COLUMN hausportal.properties.units IS 'Legacy count retained from the first prototype. Operational counts come only from hausportal.units.';
COMMENT ON COLUMN hausportal.tenants.property_id IS 'Provisional building assignment only when unit_id is NULL. Read tenant_assignments for the effective building.';
COMMENT ON COLUMN hausportal.tenants.apartment IS 'Legacy apartment label retained from migration 002. Operational apartment references use unit_id.';
COMMENT ON COLUMN hausportal.damages.location IS 'Historical location snapshot captured when the case is reported.';
COMMENT ON TABLE hausportal.damage_owner_assignments IS 'Case-specific owner assignments, including immutable owner-name snapshots and completed assignments. At most one current assignment.';
COMMENT ON VIEW hausportal.damage_participants IS 'Derived case-to-user relation; joins stored case relationships to identities without a second synchronized recipient list.';
COMMENT ON VIEW hausportal.damage_access IS 'Central effective read permissions used by all case, message, event and invoice repositories. Application authorization; not PostgreSQL RLS.';
COMMENT ON TABLE hausportal.employees IS 'Employee contact records. These descriptive roles are not login permissions.';
