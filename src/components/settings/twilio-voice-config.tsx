'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Loader2,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { SettingsPanelHead } from './settings-panel-head';

type TwilioConfigStatus = {
  configured: boolean;

  status:
    | 'not_configured'
    | 'configured'
    | 'connected'
    | 'error'
    | string;

  accountSid: string | null;
  apiKeySid: string | null;
  twimlAppSid: string | null;
  phoneNumber: string | null;

  missingVariables: string[];

  lastTestedAt: string | null;
  lastError: string | null;

  webhooks: {
    incoming: string;
    outgoing: string;
    status: string;
  };
};

export function TwilioVoiceConfig() {
  const [loading, setLoading] = useState(true);

  const [config, setConfig] =
    useState<TwilioConfigStatus | null>(null);

  const [copiedWebhook, setCopiedWebhook] =
    useState<string | null>(null);

  const loadConfiguration = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch(
        '/api/twilio/config',
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            'No se pudo cargar la configuración.',
        );
      }

      setConfig(data);
    } catch (error) {
      console.error(
        'Error loading Twilio configuration:',
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : 'No se pudo cargar Telefonía Twilio.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  async function copyWebhook(
    name: string,
    value: string,
  ) {
    await navigator.clipboard.writeText(value);

    setCopiedWebhook(name);

    toast.success('Webhook copiado.');

    window.setTimeout(() => {
      setCopiedWebhook(null);
    }, 2000);
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Telefonía Twilio"
        description="Configuración y estado del softphone de System Pass."
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadConfiguration}
          >
            <RefreshCw className="size-4" />
            Actualizar estado
          </Button>
        }
      />

      {/* Estado general */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <PhoneCall className="size-5 text-primary" />
                Estado de la telefonía
              </CardTitle>

              <CardDescription className="mt-1">
                Las credenciales privadas se leen desde
                el servidor.
              </CardDescription>
            </div>

            {config?.configured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="size-3.5" />
                Configurado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600 dark:text-amber-300">
                <AlertTriangle className="size-3.5" />
                No configurado
              </span>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {!config?.configured ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-medium">
                Faltan credenciales de Twilio
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Esto es normal por ahora. Compraremos el
                número y completaremos las variables al
                final.
              </p>

              {config?.missingVariables &&
                config.missingVariables.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {config.missingVariables.map(
                      (variable) => (
                        <code
                          key={variable}
                          className="rounded bg-muted px-2 py-1 text-xs"
                        >
                          {variable}
                        </code>
                      ),
                    )}
                  </div>
                )}
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-emerald-500" />
                El servidor encontró las credenciales.
              </p>

              <p className="mt-1 text-sm text-muted-foreground">
                Más adelante comprobaremos la conexión
                directamente con la API de Twilio.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Datos de configuración */}
      <Card>
        <CardHeader>
          <CardTitle>
            Configuración del servidor
          </CardTitle>

          <CardDescription>
            Los secretos están ocultos y nunca se envían al
            navegador.
          </CardDescription>
        </CardHeader>

        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Account SID</Label>

            <Input
              readOnly
              value={
                config?.accountSid ??
                'Pendiente de configurar'
              }
            />
          </div>

          <div className="space-y-2">
            <Label>API Key SID</Label>

            <Input
              readOnly
              value={
                config?.apiKeySid ??
                'Pendiente de configurar'
              }
            />
          </div>

          <div className="space-y-2">
            <Label>TwiML App SID</Label>

            <Input
              readOnly
              value={
                config?.twimlAppSid ??
                'Pendiente de configurar'
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Número Twilio</Label>

            <Input
              readOnly
              value={
                config?.phoneNumber ??
                'Pendiente de compra'
              }
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>API Key Secret</Label>

            <Input
              readOnly
              type="password"
              value={
                config?.configured
                  ? '••••••••••••••••'
                  : 'Pendiente de configurar'
              }
            />

            <p className="text-xs text-muted-foreground">
              Este valor permanece únicamente en
              `.env.local`.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle>
            Webhooks preparados
          </CardTitle>

          <CardDescription>
            Estas direcciones se configurarán en Twilio
            después de publicar el CRM.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {config?.webhooks && (
            <>
              <WebhookField
                label="Llamadas entrantes"
                name="incoming"
                value={config.webhooks.incoming}
                copied={copiedWebhook === 'incoming'}
                onCopy={copyWebhook}
              />

              <WebhookField
                label="Llamadas salientes"
                name="outgoing"
                value={config.webhooks.outgoing}
                copied={copiedWebhook === 'outgoing'}
                onCopy={copyWebhook}
              />

              <WebhookField
                label="Estado de llamadas"
                name="status"
                value={config.webhooks.status}
                copied={copiedWebhook === 'status'}
                onCopy={copyWebhook}
              />
            </>
          )}

          <p className="text-xs text-muted-foreground">
            En desarrollo muestran localhost. Al publicar
            el CRM mostrarán automáticamente el dominio
            real de System Pass.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function WebhookField({
  label,
  name,
  value,
  copied,
  onCopy,
}: {
  label: string;
  name: string;
  value: string;
  copied: boolean;
  onCopy: (
    name: string,
    value: string,
  ) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className="font-mono text-xs"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void onCopy(name, value)}
          aria-label={`Copiar ${label}`}
        >
          {copied ? (
            <Check className="size-4 text-emerald-500" />
          ) : (
            <Copy className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}