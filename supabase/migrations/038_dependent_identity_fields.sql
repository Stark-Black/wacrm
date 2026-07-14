-- ============================================================
-- 038_dependent_identity_fields.sql
-- Agrega tipo de identificación y últimos cuatro dígitos
-- para los dependientes.
-- ============================================================

ALTER TABLE contact_dependents
ADD COLUMN identifier_type TEXT,
ADD COLUMN identifier_last4 VARCHAR(4);

ALTER TABLE contact_dependents
ADD CONSTRAINT contact_dependents_identifier_type_check
CHECK (
  identifier_type IS NULL
  OR identifier_type IN ('ssn', 'itin')
);

ALTER TABLE contact_dependents
ADD CONSTRAINT contact_dependents_identifier_last4_check
CHECK (
  identifier_last4 IS NULL
  OR identifier_last4 ~ '^[0-9]{4}$'
);

ALTER TABLE contact_dependents
ADD CONSTRAINT contact_dependents_identifier_complete_check
CHECK (
  (
    identifier_type IS NULL
    AND identifier_last4 IS NULL
  )
  OR
  (
    identifier_type IS NOT NULL
    AND identifier_last4 IS NOT NULL
  )
);