'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CheckCircle2,
  Loader2,
  LockKeyhole,
  Mail,
  Save,
  Settings2,
} from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { SettingsPanelHead } from './settings-panel-head';

type MailboxType = 'shared' | 'user';

type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'expired'
  | 'error';

interface EmailConnection {
  id: string;
  account_id: string;
  created_by_user_id: string | null;
  connected_by_user_id: string | null;
  provider: string;
  mailbox_address: string | null;
  sender_display_name: string | null;
  tenant_id: string | null;
  external_mailbox_id: string | null;
  mailbox_type: MailboxType;
  connection_status: ConnectionStatus;
  connected_at: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getStatusLabel(status: ConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'Connected';

    case 'connecting':
      return 'Connecting';

    case 'expired':
      return 'Connection expired';

    case 'error':
      return 'Connection error';

    default:
      return 'Not connected';
  }
}

export function EmailConfig() {
  const supabase = createClient();

  const {
    user,
    accountId,
    loading: authLoading,
    profileLoading,
  } = useAuth();

  const canEditSettings = useCan('edit-settings');

  const loadedAccountIdRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [connection, setConnection] =
    useState<EmailConnection | null>(null);

  const [mailboxAddress, setMailboxAddress] = useState('');
  const [senderDisplayName, setSenderDisplayName] = useState('');
  const [mailboxType, setMailboxType] =
    useState<MailboxType>('shared');

  const loadConfiguration = useCallback(
    async (currentAccountId: string) => {
      setLoading(true);

      try {
        const { data, error } = await supabase
          .from('email_connections')
          .select(
            `
              id,
              account_id,
              created_by_user_id,
              connected_by_user_id,
              provider,
              mailbox_address,
              sender_display_name,
              tenant_id,
              external_mailbox_id,
              mailbox_type,
              connection_status,
              connected_at,
              last_synced_at,
              last_error,
              created_at,
              updated_at
            `,
          )
          .eq('account_id', currentAccountId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        const savedConnection =
          (data as EmailConnection | null) ?? null;

        setConnection(savedConnection);

        if (savedConnection) {
          setMailboxAddress(
            savedConnection.mailbox_address ?? '',
          );

          setSenderDisplayName(
            savedConnection.sender_display_name ?? '',
          );

          setMailboxType(
            savedConnection.mailbox_type ?? 'shared',
          );
        } else {
          setMailboxAddress('');
          setSenderDisplayName('');
          setMailboxType('shared');
        }
      } catch (error) {
        console.error(
          'Failed to load email configuration:',
          error,
        );

        loadedAccountIdRef.current = null;

        toast.error(
          'Failed to load the email configuration.',
        );
      } finally {
        setLoading(false);
      }
    },
    [supabase],
  );

  useEffect(() => {
    if (authLoading || profileLoading) {
      return;
    }

    if (!user || !accountId) {
      loadedAccountIdRef.current = null;
      setLoading(false);
      return;
    }

    if (loadedAccountIdRef.current === accountId) {
      return;
    }

    loadedAccountIdRef.current = accountId;

    void loadConfiguration(accountId);
  }, [
    authLoading,
    profileLoading,
    user?.id,
    accountId,
    loadConfiguration,
  ]);

  async function handleSave() {
    if (!canEditSettings) {
      toast.error(
        'Only owners and administrators can edit email settings.',
      );

      return;
    }

    if (!user) {
      toast.error('You must be signed in.');

      return;
    }

    if (!accountId) {
      toast.error(
        'Your profile is not linked to an account.',
      );

      return;
    }

    const normalizedMailbox =
      mailboxAddress.trim().toLowerCase();

    const normalizedSenderName =
      senderDisplayName.trim();

    if (!normalizedMailbox) {
      toast.error('Mailbox address is required.');

      return;
    }

    if (!isValidEmail(normalizedMailbox)) {
      toast.error(
        'Enter a valid company email address.',
      );

      return;
    }

    if (!normalizedSenderName) {
      toast.error('Sender display name is required.');

      return;
    }

    setSaving(true);

    try {
      let savedConnection: EmailConnection;

      if (connection?.id) {
        const { data, error } = await supabase
          .from('email_connections')
          .update({
            provider: 'microsoft_365',
            mailbox_address: normalizedMailbox,
            sender_display_name: normalizedSenderName,
            mailbox_type: mailboxType,
          })
          .eq('id', connection.id)
          .eq('account_id', accountId)
          .select(
            `
              id,
              account_id,
              created_by_user_id,
              connected_by_user_id,
              provider,
              mailbox_address,
              sender_display_name,
              tenant_id,
              external_mailbox_id,
              mailbox_type,
              connection_status,
              connected_at,
              last_synced_at,
              last_error,
              created_at,
              updated_at
            `,
          )
          .single();

        if (error) {
          throw error;
        }

        savedConnection = data as EmailConnection;
      } else {
        const { data, error } = await supabase
          .from('email_connections')
          .insert({
            account_id: accountId,
            created_by_user_id: user.id,
            provider: 'microsoft_365',
            mailbox_address: normalizedMailbox,
            sender_display_name: normalizedSenderName,
            mailbox_type: mailboxType,
            connection_status: 'not_connected',
          })
          .select(
            `
              id,
              account_id,
              created_by_user_id,
              connected_by_user_id,
              provider,
              mailbox_address,
              sender_display_name,
              tenant_id,
              external_mailbox_id,
              mailbox_type,
              connection_status,
              connected_at,
              last_synced_at,
              last_error,
              created_at,
              updated_at
            `,
          )
          .single();

        if (error) {
          throw error;
        }

        savedConnection = data as EmailConnection;
      }

      setConnection(savedConnection);
      setMailboxAddress(
        savedConnection.mailbox_address ?? '',
      );
      setSenderDisplayName(
        savedConnection.sender_display_name ?? '',
      );
      setMailboxType(
        savedConnection.mailbox_type ?? 'shared',
      );

      toast.success(
        'Mailbox details saved successfully.',
      );
    } catch (error) {
      console.error(
        'Failed to save email configuration:',
        error,
      );

      toast.error(
        'Failed to save the email configuration.',
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="animate-in fade-in-50 duration-200">
        <SettingsPanelHead
          title="Email"
          description="Connect and manage the shared company mailbox."
        />

        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  const connectionStatus =
    connection?.connection_status ?? 'not_connected';

  const isConnected =
    connectionStatus === 'connected';

  return (
    <section className="animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="Email"
        description="Connect and manage the shared company mailbox."
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Mail className="size-5 text-primary" />
                </div>

                <div>
                  <CardTitle>
                    Microsoft 365 mailbox
                  </CardTitle>

                  <CardDescription className="mt-1">
                    Configure the company mailbox that will
                    be shared by authorized CRM users.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-center gap-2">
                  <span
                    className={
                      isConnected
                        ? 'size-2 rounded-full bg-emerald-500'
                        : 'size-2 rounded-full bg-muted-foreground'
                    }
                  />

                  <p className="text-sm font-medium text-foreground">
                    {getStatusLabel(connectionStatus)}
                  </p>
                </div>

                <p className="mt-2 text-sm text-muted-foreground">
                  {isConnected
                    ? 'The company mailbox is connected and ready to synchronize.'
                    : connection
                      ? 'Mailbox details are saved, but Microsoft 365 authorization is still pending.'
                      : 'No company mailbox has been configured yet.'}
                </p>

                {connection?.last_error ? (
                  <p className="mt-2 text-sm text-red-400">
                    {connection.last_error}
                  </p>
                ) : null}
              </div>

              {!canEditSettings ? (
                <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-4">
                  <LockKeyhole className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Read-only access
                    </p>

                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Only account owners and administrators
                      can modify the mailbox configuration.
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email-provider">
                  Email provider
                </Label>

                <Input
                  id="email-provider"
                  value="Microsoft 365"
                  readOnly
                  className="bg-muted/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mailbox-address">
                  Company mailbox address
                </Label>

                <Input
                  id="mailbox-address"
                  type="email"
                  placeholder="info@systempass.com"
                  value={mailboxAddress}
                  onChange={(event) =>
                    setMailboxAddress(
                      event.target.value,
                    )
                  }
                  disabled={
                    !canEditSettings || saving
                  }
                />

                <p className="text-xs text-muted-foreground">
                  This is the mailbox that CRM users will
                  view and manage.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sender-display-name">
                  Sender display name
                </Label>

                <Input
                  id="sender-display-name"
                  placeholder="System Pass"
                  value={senderDisplayName}
                  onChange={(event) =>
                    setSenderDisplayName(
                      event.target.value,
                    )
                  }
                  disabled={
                    !canEditSettings || saving
                  }
                />

                <p className="text-xs text-muted-foreground">
                  Customers will see this name when the CRM
                  sends an email.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mailbox-type">
                  Mailbox type
                </Label>

                <select
                  id="mailbox-type"
                  value={mailboxType}
                  onChange={(event) =>
                    setMailboxType(
                      event.target.value as MailboxType,
                    )
                  }
                  disabled={
                    !canEditSettings || saving
                  }
                  className="
                    flex h-9 w-full rounded-md
                    border border-input bg-background
                    px-3 py-1 text-sm text-foreground
                    shadow-sm outline-none
                    transition-colors
                    focus-visible:border-ring
                    focus-visible:ring-2
                    focus-visible:ring-ring/30
                    disabled:cursor-not-allowed
                    disabled:opacity-50
                  "
                >
                  <option value="shared">
                    Shared mailbox
                  </option>

                  <option value="user">
                    User mailbox
                  </option>
                </select>

                <p className="text-xs text-muted-foreground">
                  Shared mailbox is recommended for a company
                  inbox used by several CRM agents.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={
                    saving || !canEditSettings
                  }
                >
                  {saving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Save className="size-4" />
                  )}

                  {saving
                    ? 'Saving...'
                    : 'Save mailbox details'}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled
                >
                  <Mail className="size-4" />
                  Connect Microsoft 365
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Microsoft authorization will be enabled in
                the next development step. Saving this form
                does not connect or access the mailbox yet.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Configuration status
              </CardTitle>

              <CardDescription>
                Current state of the company mailbox.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-primary" />

                Provider: Microsoft 365
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-primary" />

                Shared by account
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-primary" />

                Protected by account permissions
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 shrink-0 text-primary" />

                Templates and signatures ready
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="size-4" />
                Next connection step
              </CardTitle>
            </CardHeader>

            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground">
                The next step will add Microsoft OAuth,
                securely store the authorization data on the
                server and validate access to the selected
                mailbox.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}