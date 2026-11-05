-- Fiktive Beispieldaten aus dem bisherigen Grundgerüst.
-- Der Migrationslauf führt die gesamte Übernahme in einer Transaktion aus.
DO $$
DECLARE
  inserted_count integer;
  total_inserted integer := 0;
BEGIN
  PERFORM revision FROM hausportal.state WHERE id = 1 FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('owner-1', 'Clara Hoffmann', 'clara.hoffmann@example.com', '030 555 0101'),
      ('owner-2', 'Thomas Berger', 'thomas.berger@example.com', '030 555 0102'),
      ('owner-3', 'Elisabeth Weber', 'elisabeth.weber@example.com', '030 555 0103'),
      ('owner-4', 'Michael Winter', 'michael.winter@example.com', '030 555 0104')
    ) AS seed(id, name, email, phone)
    JOIN hausportal.owners existing USING (id)
    WHERE ROW(existing.id, existing.name, existing.email, existing.phone) IS DISTINCT FROM ROW(seed.id, seed.name, seed.email, seed.phone)
  ) THEN
    RAISE EXCEPTION 'Beispieldaten-Kollision in owners. Vorhandene Einträge zuerst prüfen.';
  END IF;

  INSERT INTO hausportal.owners (id, name, email, phone)
  VALUES
      ('owner-1', 'Clara Hoffmann', 'clara.hoffmann@example.com', '030 555 0101'),
      ('owner-2', 'Thomas Berger', 'thomas.berger@example.com', '030 555 0102'),
      ('owner-3', 'Elisabeth Weber', 'elisabeth.weber@example.com', '030 555 0103'),
      ('owner-4', 'Michael Winter', 'michael.winter@example.com', '030 555 0104')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  total_inserted := total_inserted + inserted_count;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('property-1', 'Haus am Park', 'Parkstraße 12', '10405', 'Berlin', 2, 'owner-1'),
      ('property-2', 'Lindenhof', 'Lindenallee 24', '10437', 'Berlin', 1, 'owner-2'),
      ('property-3', 'Stadtvilla West', 'Kantstraße 8', '10623', 'Berlin', 1, 'owner-3'),
      ('property-4', 'Gartenquartier', 'Gartenstraße 36', '10115', 'Berlin', 1, 'owner-1')
    ) AS seed(id, name, street, postal_code, city, units, owner_id)
    JOIN hausportal.properties existing USING (id)
    WHERE ROW(existing.id, existing.name, existing.street, existing.postal_code, existing.city, existing.units, existing.owner_id) IS DISTINCT FROM ROW(seed.id, seed.name, seed.street, seed.postal_code, seed.city, seed.units, seed.owner_id)
  ) THEN
    RAISE EXCEPTION 'Beispieldaten-Kollision in properties. Vorhandene Einträge zuerst prüfen.';
  END IF;

  INSERT INTO hausportal.properties (id, name, street, postal_code, city, units, owner_id)
  VALUES
      ('property-1', 'Haus am Park', 'Parkstraße 12', '10405', 'Berlin', 2, 'owner-1'),
      ('property-2', 'Lindenhof', 'Lindenallee 24', '10437', 'Berlin', 1, 'owner-2'),
      ('property-3', 'Stadtvilla West', 'Kantstraße 8', '10623', 'Berlin', 1, 'owner-3'),
      ('property-4', 'Gartenquartier', 'Gartenstraße 36', '10115', 'Berlin', 1, 'owner-1')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  total_inserted := total_inserted + inserted_count;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('unit-1', '1. OG links', 'property-1'),
      ('unit-2', '2. OG rechts', 'property-1'),
      ('unit-3', 'EG links', 'property-2'),
      ('unit-4', '1. OG', 'property-3')
    ) AS seed(id, name, property_id)
    JOIN hausportal.units existing USING (id)
    WHERE ROW(existing.id, existing.name, existing.property_id) IS DISTINCT FROM ROW(seed.id, seed.name, seed.property_id)
  ) THEN
    RAISE EXCEPTION 'Beispieldaten-Kollision in units. Vorhandene Einträge zuerst prüfen.';
  END IF;

  INSERT INTO hausportal.units (id, name, property_id)
  VALUES
      ('unit-1', '1. OG links', 'property-1'),
      ('unit-2', '2. OG rechts', 'property-1'),
      ('unit-3', 'EG links', 'property-2'),
      ('unit-4', '1. OG', 'property-3')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  total_inserted := total_inserted + inserted_count;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('tenant-1', 'Anna Schneider', 'anna.schneider@example.com', '030 555 0201', NULL, 'unit-1'),
      ('tenant-2', 'Jonas Fischer', 'jonas.fischer@example.com', '030 555 0202', NULL, 'unit-2'),
      ('tenant-3', 'Lea Wagner', 'lea.wagner@example.com', '030 555 0203', NULL, 'unit-3'),
      ('tenant-4', 'Paul Neumann', 'paul.neumann@example.com', '030 555 0204', NULL, 'unit-4'),
      ('tenant-5', 'Marie Schulz', 'marie.schulz@example.com', '030 555 0205', NULL, NULL)
    ) AS seed(id, name, email, phone, property_id, unit_id)
    JOIN hausportal.tenants existing USING (id)
    WHERE ROW(existing.id, existing.name, existing.email, existing.phone, existing.property_id, existing.unit_id) IS DISTINCT FROM ROW(seed.id, seed.name, seed.email, seed.phone, seed.property_id, seed.unit_id)
  ) THEN
    RAISE EXCEPTION 'Beispieldaten-Kollision in tenants. Vorhandene Einträge zuerst prüfen.';
  END IF;

  INSERT INTO hausportal.tenants (id, name, email, phone, property_id, unit_id)
  VALUES
      ('tenant-1', 'Anna Schneider', 'anna.schneider@example.com', '030 555 0201', NULL, 'unit-1'),
      ('tenant-2', 'Jonas Fischer', 'jonas.fischer@example.com', '030 555 0202', NULL, 'unit-2'),
      ('tenant-3', 'Lea Wagner', 'lea.wagner@example.com', '030 555 0203', NULL, 'unit-3'),
      ('tenant-4', 'Paul Neumann', 'paul.neumann@example.com', '030 555 0204', NULL, 'unit-4'),
      ('tenant-5', 'Marie Schulz', 'marie.schulz@example.com', '030 555 0205', NULL, NULL)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  total_inserted := total_inserted + inserted_count;

  IF EXISTS (
    SELECT 1 FROM (VALUES
      ('employee-1', 'Sophie Krüger', 'sophie.krueger@example.com', 'Verwaltung'),
      ('employee-2', 'David Braun', 'david.braun@example.com', 'Buchhaltung'),
      ('employee-3', 'Lena Wolf', 'lena.wolf@example.com', 'Technik')
    ) AS seed(id, name, email, role)
    JOIN hausportal.employees existing USING (id)
    WHERE ROW(existing.id, existing.name, existing.email, existing.role) IS DISTINCT FROM ROW(seed.id, seed.name, seed.email, seed.role)
  ) THEN
    RAISE EXCEPTION 'Beispieldaten-Kollision in employees. Vorhandene Einträge zuerst prüfen.';
  END IF;

  INSERT INTO hausportal.employees (id, name, email, role)
  VALUES
      ('employee-1', 'Sophie Krüger', 'sophie.krueger@example.com', 'Verwaltung'),
      ('employee-2', 'David Braun', 'david.braun@example.com', 'Buchhaltung'),
      ('employee-3', 'Lena Wolf', 'lena.wolf@example.com', 'Technik')
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  total_inserted := total_inserted + inserted_count;

  IF total_inserted > 0 THEN
    UPDATE hausportal.state SET revision = revision + 1 WHERE id = 1;
  END IF;
END $$;
