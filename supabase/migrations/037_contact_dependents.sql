-- ============================================================
-- 037_contact_dependents.sql
-- Dependientes asociados a un contacto/cliente.
--
-- Un contacto puede tener:
-- - Cero dependientes
-- - Un dependiente
-- - Varios dependientes
-- ============================================================

CREATE TABLE IF NOT EXISTS contact_dependents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Cuenta o empresa propietaria de los datos
  account_id UUID NOT NULL
    REFERENCES accounts(id)
    ON DELETE CASCADE,

  -- Contacto o cliente principal
  contact_id UUID NOT NULL
    REFERENCES contacts(id)
    ON DELETE CASCADE,

  -- Usuario que registró al dependiente
  created_by_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  -- Información del dependiente
  full_name TEXT NOT NULL
    CHECK (btrim(full_name) <> ''),

  relationship TEXT,
  birth_date DATE,
  phone TEXT,
  email TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Búsqueda rápida de dependientes de un contacto
CREATE INDEX IF NOT EXISTS idx_contact_dependents_contact_id
  ON contact_dependents(contact_id);

-- Búsqueda por cuenta
CREATE INDEX IF NOT EXISTS idx_contact_dependents_account_id
  ON contact_dependents(account_id);

-- Actualización automática de updated_at
DROP TRIGGER IF EXISTS set_updated_at
  ON contact_dependents;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON contact_dependents
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE contact_dependents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contact_dependents_select
  ON contact_dependents;

DROP POLICY IF EXISTS contact_dependents_insert
  ON contact_dependents;

DROP POLICY IF EXISTS contact_dependents_update
  ON contact_dependents;

DROP POLICY IF EXISTS contact_dependents_delete
  ON contact_dependents;

-- Cualquier miembro de la cuenta puede ver los dependientes
CREATE POLICY contact_dependents_select
ON contact_dependents
FOR SELECT
USING (
  is_account_member(account_id)
);

-- Agentes, administradores y propietarios pueden registrar
CREATE POLICY contact_dependents_insert
ON contact_dependents
FOR INSERT
WITH CHECK (
  is_account_member(account_id, 'agent')
  AND EXISTS (
    SELECT 1
    FROM contacts
    WHERE contacts.id = contact_dependents.contact_id
      AND contacts.account_id = contact_dependents.account_id
  )
);

-- Agentes, administradores y propietarios pueden editar
CREATE POLICY contact_dependents_update
ON contact_dependents
FOR UPDATE
USING (
  is_account_member(account_id, 'agent')
)
WITH CHECK (
  is_account_member(account_id, 'agent')
  AND EXISTS (
    SELECT 1
    FROM contacts
    WHERE contacts.id = contact_dependents.contact_id
      AND contacts.account_id = contact_dependents.account_id
  )
);

-- Agentes, administradores y propietarios pueden eliminar
CREATE POLICY contact_dependents_delete
ON contact_dependents
FOR DELETE
USING (
  is_account_member(account_id, 'agent')
);