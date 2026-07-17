-- ============================================================
-- 043_contact_type_profession_sector.sql
--
-- Nuevos tipos de contacto:
-- Individual -> Profession
-- Company    -> Company Name y Sector
-- ============================================================

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS contact_type TEXT;

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS profession TEXT;

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS sector TEXT;

-- Clasificar contactos existentes.
-- Si ya tienen Company, serán Company.
-- Los demás serán Individual.
UPDATE public.contacts
SET contact_type = CASE
  WHEN company IS NOT NULL
    AND BTRIM(company) <> ''
    THEN 'company'
  ELSE 'individual'
END
WHERE contact_type IS NULL;

ALTER TABLE public.contacts
ALTER COLUMN contact_type
SET DEFAULT 'individual';

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
    'individual',
    'company'
  )
);

CREATE INDEX IF NOT EXISTS
idx_contacts_account_contact_type
ON public.contacts (
  account_id,
  contact_type
);