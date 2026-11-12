SELECT revision FROM hausportal.state WHERE id = 1 FOR UPDATE;

ALTER TABLE hausportal.damage_owner_assignments
  ADD UNIQUE (damage_id, id);

ALTER TABLE hausportal.damage_messages
  ADD COLUMN owner_assignment_id bigint,
  ADD FOREIGN KEY (damage_id, owner_assignment_id)
    REFERENCES hausportal.damage_owner_assignments(damage_id, id),
  ADD CHECK (channel = 'owner' OR owner_assignment_id IS NULL);

-- Legacy owner messages belonged to the invoiced recipient. Keep unmatched rows
-- for the administration without sharing them with a replacement owner.
UPDATE hausportal.damage_messages m
SET owner_assignment_id = a.id
FROM hausportal.damage_invoices i
JOIN hausportal.damage_owner_assignments a
  ON a.damage_id = i.damage_id AND a.owner_id = i.owner_id AND a.ended_at IS NULL
WHERE m.damage_id = i.damage_id AND m.channel = 'owner';

-- An older deployment can still post invoice notes during the rollout.
CREATE FUNCTION hausportal.assign_legacy_owner_message()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.channel = 'owner' AND NEW.owner_assignment_id IS NULL THEN
    SELECT a.id INTO NEW.owner_assignment_id
    FROM hausportal.damage_invoices i
    JOIN hausportal.damage_owner_assignments a
      ON a.damage_id = i.damage_id AND a.owner_id = i.owner_id AND a.ended_at IS NULL
    WHERE i.damage_id = NEW.damage_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER damage_message_legacy_assignment
  BEFORE INSERT ON hausportal.damage_messages
  FOR EACH ROW EXECUTE FUNCTION hausportal.assign_legacy_owner_message();
