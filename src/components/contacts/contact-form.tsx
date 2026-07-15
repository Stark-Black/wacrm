'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';

import type {
  Contact,
  ContactTag,
  Tag,
} from '@/types';

import {
  findExistingContact,
  isExactMatch,
  isUniqueViolation,
  type ExistingContact,
} from '@/lib/contacts/dedupe';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';


type DependentIdentifierType = '' | 'ssn' | 'itin';

type DependentFormItem = {
  key: string;
  id?: string;

  full_name: string;
  relationship: string;
  relationship_other: string;
  birth_date: string;

  identifier_type: DependentIdentifierType;
  identifier_last4: string;
};

function createEmptyDependent(): DependentFormItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,

    full_name: '',
    relationship: '',
    relationship_other: '',
    birth_date: '',

    identifier_type: '',
    identifier_last4: '',
  };
}

interface ContactFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact?: Contact | null;
  contactTags?: ContactTag[];
  onSaved: () => void;
  /** Open an existing contact's detail view — used by the duplicate
   *  notice to jump to the contact that already owns this number. */
  onViewExisting?: (contactId: string) => void;
}

export function ContactForm({
  open,
  onOpenChange,
  contact,
  contactTags = [],
  onSaved,
  onViewExisting,
}: ContactFormProps) {
  const t = useTranslations('Contacts.form');
  const supabase = createClient();
  const { accountId } = useAuth();
  const isEdit = !!contact;

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');

  const [dependents, setDependents] = useState<DependentFormItem[]>([]);
  const [loadingDependents, setLoadingDependents] = useState(false);

  const [saving, setSaving] = useState(false);

  // Duplicate-phone detection for NEW contacts. `exact` (same digits)
  // hard-blocks the save; a fuzzy trunk-variant match only warns. The
  // DB unique index (migration 022) is the real backstop — this is the
  // friendly heads-up before we get there.
  const [dupMatch, setDupMatch] = useState<
    { contact: ExistingContact; exact: boolean } | null
  >(null);
  const [checkingDup, setCheckingDup] = useState(false);

  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);

  useEffect(() => {
    if (open) {
      setName(contact?.name ?? '');
      setPhone(contact?.phone ?? '');
      setEmail(contact?.email ?? '');
      setCompany(contact?.company ?? '');

      if(contact?.id){
        void fetchDependents(contact.id);
      }else {

        setDependents([]);
      }
      
      setSelectedTagIds(contactTags.map((ct) => ct.tag_id));
      setDupMatch(null);
      fetchTags();
    }
  }, [open, contact]);

  // Look up an existing contact with this number (new contacts only).
  // Runs on blur so we don't query on every keystroke.
  async function checkDuplicate() {
    if (isEdit || !accountId) return;
    const value = phone.trim();
    if (!value) {
      setDupMatch(null);
      return;
    }
    setCheckingDup(true);
    try {
      const existing = await findExistingContact(supabase, accountId, value);
      setDupMatch(
        existing
          ? { contact: existing, exact: isExactMatch(existing, value) }
          : null,
      );
    } finally {
      setCheckingDup(false);
    }
  }

  async function fetchTags() {
    setLoadingTags(true);
    const { data } = await supabase
      .from('tags')
      .select('*')
      .order('name');
    if (data) setTags(data);
    setLoadingTags(false);
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }

  async function fetchDependents(contactId: string) {
  setLoadingDependents(true);

  try {
    const { data, error } = await supabase
      .from('contact_dependents')
      .select(
        'id, full_name, relationship, birth_date, identifier_type, identifier_last4',
      )
      .eq('contact_id', contactId)
      .order('created_at', { ascending: true });

    if (error) throw error;



    const knownRelationships = [
    'Hijo',
    'Hija',
    'Esposo',
    'Esposa',
    'Padre',
    'Madre',
    'Hermano',
    'Hermana',
  ];

    setDependents(
  (data ?? []).map((dependent) => {
    const relationship = dependent.relationship ?? '';

    const isKnownRelationship =
      knownRelationships.includes(relationship);

    return {
      key: dependent.id,
      id: dependent.id,

      full_name: dependent.full_name ?? '',

      relationship:
        !relationship || isKnownRelationship
          ? relationship
          : 'Otro',

      relationship_other:
        relationship && !isKnownRelationship
          ? relationship
          : '',

      birth_date: dependent.birth_date ?? '',

      identifier_type:
        dependent.identifier_type === 'ssn' ||
        dependent.identifier_type === 'itin'
          ? dependent.identifier_type
          : '',

      identifier_last4:
        dependent.identifier_last4 ?? '',
    };
  }),
);
  } catch (error) {
    console.error('Error loading dependents:', error);
    toast.error('No se pudieron cargar los dependientes.');
    setDependents([]);
  } finally {
    setLoadingDependents(false);
  }
}

function addDependent() {
  setDependents((current) => [...current, createEmptyDependent()]);
}

function removeDependent(index: number) {
  setDependents((current) =>
    current.filter((_, currentIndex) => currentIndex !== index),
  );
}

function updateDependent(
  index: number,
  field: keyof Omit<DependentFormItem, 'key' | 'id'>,
  value: string,
) {
  setDependents((current) =>
    current.map((dependent, currentIndex) =>
      currentIndex === index
        ? {
            ...dependent,
            [field]: value,
          }
        : dependent,
    ),
  );
}

function hasDependentData(dependent: DependentFormItem) {
  return [
    dependent.full_name,
    dependent.relationship,
    dependent.relationship_other,
    dependent.birth_date,
    dependent.identifier_type,
    dependent.identifier_last4,
  ].some((value) => value.trim() !== '');
}

async function syncDependents(
  contactId: string,
  userId: string,
  currentAccountId: string,
  items: DependentFormItem[],
) {
  const { data: existingDependents, error: fetchError } = await supabase
    .from('contact_dependents')
    .select('id')
    .eq('contact_id', contactId);

  if (fetchError) throw fetchError;

  const idsToKeep = new Set(
    items
      .filter((dependent) => dependent.id)
      .map((dependent) => dependent.id as string),
  );

  const idsToDelete = (existingDependents ?? [])
    .map((dependent) => dependent.id)
    .filter((id) => !idsToKeep.has(id));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('contact_dependents')
      .delete()
      .in('id', idsToDelete);

    if (deleteError) throw deleteError;
  }

  for (const dependent of items) {
    const finalRelationship =
  dependent.relationship === 'Otro'
    ? dependent.relationship_other.trim()
    : dependent.relationship.trim();

const dependentData = {
  full_name: dependent.full_name.trim(),

  relationship:
    finalRelationship || null,

  birth_date:
    dependent.birth_date || null,

  identifier_type:
    dependent.identifier_type || null,

  identifier_last4:
    dependent.identifier_last4 || null,

  updated_at: new Date().toISOString(),
    };

    if (dependent.id) {
      const { error: updateError } = await supabase
        .from('contact_dependents')
        .update(dependentData)
        .eq('id', dependent.id)
        .eq('contact_id', contactId);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from('contact_dependents')
        .insert({
          ...dependentData,
          account_id: currentAccountId,
          contact_id: contactId,
          created_by_user_id: userId,
        });

      if (insertError) throw insertError;
    }
  }
}
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();

  if (!phone.trim()) {
    toast.error(t('phoneRequired'));
    return;
  }

  const dependentsToSave = dependents.filter(hasDependentData);

  // Validar que todo dependiente agregado tenga nombre
  const dependentWithoutName = dependentsToSave.some(
    (dependent) => !dependent.full_name.trim(),
  );

  if (dependentWithoutName) {
    toast.error('Cada dependiente debe tener un nombre completo.');
    return;
  }

  // Validar parentesco "Otro"
  const dependentWithoutOtherRelationship = dependentsToSave.some(
    (dependent) =>
      dependent.relationship === 'Otro' &&
      !dependent.relationship_other.trim(),
  );

  if (dependentWithoutOtherRelationship) {
    toast.error(
      'Especifica el parentesco cuando selecciones la opción Otro.',
    );
    return;
  }

  // Validar que SSN/ITIN y últimos 4 dígitos se completen juntos
  const dependentWithIncompleteIdentifier = dependentsToSave.some(
    (dependent) => {
      const hasIdentifierType = Boolean(dependent.identifier_type);
      const hasIdentifierLast4 = Boolean(
        dependent.identifier_last4.trim(),
      );

      return hasIdentifierType !== hasIdentifierLast4;
    },
  );

  if (dependentWithIncompleteIdentifier) {
    toast.error(
      'Selecciona SSN o ITIN y escribe sus últimos cuatro dígitos.',
    );
    return;
  }

  // Validar exactamente cuatro números
  const dependentWithInvalidLast4 = dependentsToSave.some(
    (dependent) =>
      dependent.identifier_last4.trim() !== '' &&
      !/^\d{4}$/.test(dependent.identifier_last4.trim()),
  );

  if (dependentWithInvalidLast4) {
    toast.error(
      'El SSN o ITIN debe contener exactamente sus últimos cuatro números.',
    );
    return;
  }

  // Evitar contacto duplicado al crear
  if (!isEdit && dupMatch?.exact) {
    toast.error(t('toastConflict'));
    return;
  }

  setSaving(true);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const user = session?.user;

    if (!user) {
      throw new Error('Not authenticated');
    }

    if (!accountId) {
      throw new Error(
        'Your profile is not linked to an account.',
      );
    }

    let contactId = contact?.id;

    // Editar contacto existente
    if (isEdit && contactId) {
      const { error } = await supabase
        .from('contacts')
        .update({
          name: name.trim() || null,
          phone: phone.trim(),
          email: email.trim() || null,
          company: company.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId);

      if (error) {
        throw error;
      }
    } else {
      // Crear contacto nuevo
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: name.trim() || null,
          phone: phone.trim(),
          email: email.trim() || null,
          company: company.trim() || null,
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      contactId = data.id;
    }

    if (!contactId) {
      throw new Error(
        'No se pudo obtener el identificador del contacto.',
      );
    }

    // Crear, editar o eliminar dependientes
    await syncDependents(
      contactId,
      user.id,
      accountId,
      dependentsToSave,
    );

    // Eliminar relaciones anteriores con etiquetas
    const { error: deleteTagsError } = await supabase
      .from('contact_tags')
      .delete()
      .eq('contact_id', contactId);

    if (deleteTagsError) {
      throw deleteTagsError;
    }

    // Guardar las etiquetas seleccionadas
    if (selectedTagIds.length > 0) {
      const tagRows = selectedTagIds.map((tagId) => ({
        contact_id: contactId,
        tag_id: tagId,
      }));

      const { error: tagError } = await supabase
        .from('contact_tags')
        .insert(tagRows);

      if (tagError) {
        throw tagError;
      }
    }

    toast.success(
      isEdit
        ? t('toastSuccessEdit')
        : t('toastSuccessAdd'),
    );

    onOpenChange(false);
    onSaved();
  } catch (err: unknown) {
    // Detectar teléfono duplicado
    if (isUniqueViolation(err)) {
      toast.error(t('toastConflict'));

      if (!isEdit && accountId) {
        const existing = await findExistingContact(
          supabase,
          accountId,
          phone.trim(),
        );

        if (existing) {
          setDupMatch({
            contact: existing,
            exact: true,
          });
        }
      }

      return;
    }

    console.error('Error saving contact:', err);

    const message =
      err instanceof Error
        ? err.message
        : t('toastError');

    toast.error(message);
  } finally {
    setSaving(false);
  }
}




  

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
  className="
    max-h-[90vh]
    w-[calc(100vw-2rem)]
    overflow-y-auto
    overscroll-contain
    bg-popover
    border-border
    text-popover-foreground
    sm:max-w-2xl
  "
>
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">
            {isEdit ? t('editTitle') : t('addTitle')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {isEdit
              ? t('editDesc')
              : t('addDesc')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cf-name" className="text-muted-foreground">
              {t('nameLabel')}
            </Label>
            <Input
              id="cf-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-phone" className="text-muted-foreground">
              {t('phoneLabel')} <span className="text-red-400">*</span>
            </Label>
            <Input
              id="cf-phone"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (dupMatch) setDupMatch(null);
              }}
              onBlur={checkDuplicate}
              placeholder={t('phonePlaceholder')}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
            {dupMatch ? (
              <div
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs ${
                  dupMatch.exact
                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                }`}
              >
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <div className="space-y-1">
                  <p>
                    {dupMatch.exact
                      ? t('dupExact')
                      : t('dupSimilar')}
                  </p>
                  {onViewExisting && (
                    <button
                      type="button"
                      onClick={() => onViewExisting(dupMatch.contact.id)}
                      className="font-medium underline underline-offset-2 hover:no-underline"
                    >
                      {t('viewExisting', { name: dupMatch.contact.name || dupMatch.contact.phone })}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                {t('phoneHint')}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-email" className="text-muted-foreground">
              {t('emailLabel')}
            </Label>
            <Input
              id="cf-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cf-company" className="text-muted-foreground">
              {t('companyLabel')}
            </Label>
            <Input
              id="cf-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder={t('companyPlaceholder')}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>


          <div className="space-y-4 rounded-lg border border-border p-4">
  {/* Encabezado */}
  <div className="flex items-start justify-between gap-4">
    <div>
      <Label className="text-base font-semibold">
        Dependientes
      </Label>

      <p className="mt-1 text-sm text-muted-foreground">
        Opcional. Agrega uno o varios dependientes al cliente.
      </p>
    </div>

    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={addDependent}
      disabled={loadingDependents || saving}
    >
      <Plus className="mr-2 h-4 w-4" />
      Agregar
    </Button>
  </div>

  {/* Estado de carga */}
  {loadingDependents ? (
    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Cargando dependientes...
    </div>
  ) : dependents.length === 0 ? (
    /* Sin dependientes */
    <div className="rounded-md border border-dashed border-border p-4">
      <p className="text-sm text-muted-foreground">
        Este contacto todavía no tiene dependientes.
      </p>
    </div>
  ) : (
    /* Lista de dependientes */
    <div className="space-y-4">
      {dependents.map((dependent, index) => (
        <div
          key={dependent.key}
          className="space-y-4 rounded-lg border border-border bg-muted/20 p-4"
        >
          {/* Título y botón eliminar */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">
              Dependiente {index + 1}
            </p>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeDependent(index)}
              disabled={saving}
              aria-label={`Eliminar dependiente ${index + 1}`}
              title="Eliminar dependiente"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>

          {/* Nombre completo */}
          <div className="space-y-2">
            <Label
              htmlFor={`dependent-name-${dependent.key}`}
            >
              Nombre completo *
            </Label>

            <Input
              id={`dependent-name-${dependent.key}`}
              value={dependent.full_name}
              onChange={(event) =>
                updateDependent(
                  index,
                  'full_name',
                  event.target.value,
                )
              }
              placeholder="Nombre completo del dependiente"
              disabled={saving}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Parentesco */}
            <div className="space-y-2">
              <Label
                htmlFor={`dependent-relationship-${dependent.key}`}
              >
                Parentesco
              </Label>

              <Select
                value={dependent.relationship}
                onValueChange={(value) => {
  const relationshipValue = value ?? '';

  updateDependent(
    index,
    'relationship',
    relationshipValue,
  );

  if (relationshipValue !== 'Otro') {
    updateDependent(
      index,
      'relationship_other',
      '',
    );
  }
}}
                disabled={saving}
              >
                <SelectTrigger
                  id={`dependent-relationship-${dependent.key}`}
                  className="w-full"
                >
                  <SelectValue placeholder="Seleccionar parentesco" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="Hijo">
                    Hijo
                  </SelectItem>

                  <SelectItem value="Hija">
                    Hija
                  </SelectItem>

                  <SelectItem value="Esposo">
                    Esposo
                  </SelectItem>

                  <SelectItem value="Esposa">
                    Esposa
                  </SelectItem>

                  <SelectItem value="Padre">
                    Padre
                  </SelectItem>

                  <SelectItem value="Madre">
                    Madre
                  </SelectItem>

                  <SelectItem value="Hermano">
                    Hermano
                  </SelectItem>

                  <SelectItem value="Hermana">
                    Hermana
                  </SelectItem>

                  <SelectItem value="Nieto">
                    Nieto
                  </SelectItem>

                  <SelectItem value="Nieta">
                    Nieta
                  </SelectItem>

                  <SelectItem value="Otro">
                    Otro
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Fecha de nacimiento */}
            <div className="space-y-2">
              <Label
                htmlFor={`dependent-birth-date-${dependent.key}`}
              >
                Fecha de nacimiento
              </Label>

              <Input
                id={`dependent-birth-date-${dependent.key}`}
                type="date"
                value={dependent.birth_date}
                onChange={(event) =>
                  updateDependent(
                    index,
                    'birth_date',
                    event.target.value,
                  )
                }
                disabled={saving}
              />
            </div>
          </div>

          {/* Parentesco personalizado */}
          {dependent.relationship === 'Otro' && (
            <div className="space-y-2">
              <Label
                htmlFor={`dependent-relationship-other-${dependent.key}`}
              >
                Especificar parentesco *
              </Label>

              <Input
                id={`dependent-relationship-other-${dependent.key}`}
                value={dependent.relationship_other}
                onChange={(event) =>
                  updateDependent(
                    index,
                    'relationship_other',
                    event.target.value,
                  )
                }
                placeholder="Ejemplo: Tutor legal, sobrino..."
                disabled={saving}
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Tipo de identificación */}
            <div className="space-y-2">
              <Label
                htmlFor={`dependent-identifier-type-${dependent.key}`}
              >
                Tipo de identificación
              </Label>

              <Select
                value={dependent.identifier_type}
                onValueChange={(value) => {
  const identifierValue = value ?? '';

  updateDependent(
    index,
    'identifier_type',
    identifierValue,
  );
}}
                disabled={saving}
              >
                <SelectTrigger
                  id={`dependent-identifier-type-${dependent.key}`}
                  className="w-full"
                >
                  <SelectValue placeholder="Seleccionar SSN o ITIN" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="ssn">
                    SSN
                  </SelectItem>

                  <SelectItem value="itin">
                    ITIN
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Últimos cuatro dígitos */}
            <div className="space-y-2">
              <Label
                htmlFor={`dependent-identifier-last4-${dependent.key}`}
              >
                Últimos 4 dígitos
              </Label>

              <Input
                id={`dependent-identifier-last4-${dependent.key}`}
                value={dependent.identifier_last4}
                onChange={(event) => {
                  const onlyNumbers = event.target.value
                    .replace(/\D/g, '')
                    .slice(0, 4);

                  updateDependent(
                    index,
                    'identifier_last4',
                    onlyNumbers,
                  );
                }}
                inputMode="numeric"
                maxLength={4}
                autoComplete="off"
                placeholder="1234"
                disabled={saving}
              />

              <p className="text-xs text-muted-foreground">
                Registra únicamente los últimos cuatro números.
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )}
</div>


          

          


          






          <div className="space-y-2">
            <Label className="text-muted-foreground">{t('tagsLabel')}</Label>
            {loadingTags ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="size-3 animate-spin" />
                {t('loadingTags')}
              </div>
            ) : tags.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('noTagsAvailable')}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${
                        selected
                          ? 'ring-2 ring-primary ring-offset-1 ring-offset-border'
                          : 'opacity-60 hover:opacity-100'
                      }`}
                      style={{
                        backgroundColor: tag.color + '20',
                        color: tag.color,
                        borderColor: tag.color,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter
  className="
    sticky bottom-0 z-10
    -mx-6 -mb-6 mt-4
    border-t border-border
    bg-popover
    px-6 py-4
  "
>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={saving || checkingDup || (!isEdit && !!dupMatch?.exact)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? t('update') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
