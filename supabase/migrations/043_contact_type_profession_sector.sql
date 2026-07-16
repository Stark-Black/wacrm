-- ============================================================
-- 043_contact_type_profession_sector.sql
--
-- Permite distinguir contactos tipo:
-- 1. Persona Natural
-- 2. Empresa
--
-- Persona Natural utiliza profession.
-- Empresa utiliza company y sector.
-- ============================================================

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS contact_type TEXT;

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS profession TEXT;

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS sector TEXT;

-- Los contactos antiguos se consideran Persona Natural
-- cuando no tienen empresa, y Empresa cuando sí tienen.
UPDATE public.contacts
SET contact_type = CASE
  WHEN company IS NOT NULL
    AND BTRIM(company) <> ''
    THEN 'company'
  ELSE 'natural_person'
END
WHERE contact_type IS NULL;

ALTER TABLE public.contacts
ALTER COLUMN contact_type
SET DEFAULT 'natural_person';

ALTER TABLE public.contacts
ALTER COLUMN contact_type
SET NOT NULL;

ALTER TABLE public.contacts
DROP CONSTRAINT IF EXISTS
contacts_contact_type_check;

ALTER TABLE public.contacts
ADD CONSTRAINT contacts_contact_type_check
CHECK (
  contact_type IN (
    'natural_person',
    'company'
  )
);

CREATE INDEX IF NOT EXISTS
idx_contacts_account_contact_type
ON public.contacts(account_id, contact_type);