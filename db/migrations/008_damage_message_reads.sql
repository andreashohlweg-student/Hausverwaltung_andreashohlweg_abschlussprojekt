CREATE TABLE hausportal.damage_message_reads (
  message_id uuid NOT NULL REFERENCES hausportal.damage_messages(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'owner', 'tenant')),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, role)
);
