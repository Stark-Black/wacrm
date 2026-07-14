'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Call,
  Device,
} from '@twilio/voice-sdk';

import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  Power,
  PowerOff,
  X,
} from 'lucide-react';

import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

type SoftphoneStatus =
  | 'offline'
  | 'connecting'
  | 'available'
  | 'ringing'
  | 'in_call'
  | 'error';

type TokenResponse = {
  configured: boolean;
  token?: string;
  identity?: string;
  expiresIn?: number;
  error?: string;
  missingVariables?: string[];
};

function getCallerNumber(call: Call | null) {
  if (!call) return 'Número desconocido';

  return (
    call.parameters.From ||
    call.parameters.Caller ||
    'Número desconocido'
  );
}

export function TwilioSoftphone() {
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] =
    useState<SoftphoneStatus>('offline');

  const [identity, setIdentity] =
    useState<string | null>(null);

  const [incomingCall, setIncomingCall] =
    useState<Call | null>(null);

  const [activeCall, setActiveCall] =
    useState<Call | null>(null);

  const [muted, setMuted] = useState(false);
  const [lastError, setLastError] =
    useState<string | null>(null);

  const fetchToken = useCallback(async () => {
    const response = await fetch('/api/twilio/token', {
      method: 'GET',
      cache: 'no-store',
    });

    const data =
      (await response.json()) as TokenResponse;

    if (!response.ok || !data.configured || !data.token) {
      const error = new Error(
        data.error ||
          'La telefonía Twilio no está configurada.',
      );

      Object.assign(error, {
        missingVariables: data.missingVariables,
      });

      throw error;
    }

    return data;
  }, []);

  const clearCurrentCall = useCallback(() => {
    activeCallRef.current = null;

    setIncomingCall(null);
    setActiveCall(null);
    setMuted(false);

    setStatus(
      deviceRef.current?.state === 'registered'
        ? 'available'
        : 'offline',
    );
  }, []);

  const configureCallEvents = useCallback(
    (call: Call) => {
      call.on('accept', () => {
        activeCallRef.current = call;

        setIncomingCall(null);
        setActiveCall(call);
        setStatus('in_call');
      });

      call.on('disconnect', () => {
        clearCurrentCall();
      });

      call.on('cancel', () => {
        clearCurrentCall();
      });

      call.on('reject', () => {
        clearCurrentCall();
      });

      call.on('error', (error) => {
        console.error(
          'Twilio call error:',
          error,
        );

        setLastError(error.message);
        toast.error(error.message);
        clearCurrentCall();
      });
    },
    [clearCurrentCall],
  );

  const refreshDeviceToken = useCallback(
    async (device: Device) => {
      try {
        const data = await fetchToken();

        if (!data.token) {
          throw new Error(
            'No se recibió un token válido.',
          );
        }

        device.updateToken(data.token);
      } catch (error) {
        console.error(
          'Error refreshing Twilio token:',
          error,
        );

        setLastError(
          error instanceof Error
            ? error.message
            : 'No se pudo renovar el token.',
        );
      }
    },
    [fetchToken],
  );

  async function activateSoftphone() {
    if (deviceRef.current) {
      if (
        deviceRef.current.state !== 'registered'
      ) {
        setStatus('connecting');
        await deviceRef.current.register();
      }

      return;
    }

    setExpanded(true);
    setStatus('connecting');
    setLastError(null);

    try {
      /*
       * Solicita permiso para el micrófono antes de crear
       * el dispositivo. Detenemos inmediatamente la pista
       * porque todavía no hay una llamada activa.
       */
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

      stream
        .getTracks()
        .forEach((track) => track.stop());

      const data = await fetchToken();

      if (!data.token) {
        throw new Error(
          'No se recibió el token de Twilio.',
        );
      }

      const device = new Device(data.token, {
        closeProtection: true,
        codecPreferences: [
            Call.Codec.Opus,
            Call.Codec.PCMU,
        ],
        tokenRefreshMs: 60_000,
    });
      deviceRef.current = device;
      setIdentity(data.identity ?? null);

      device.on('registering', () => {
        setStatus('connecting');
      });

      device.on('registered', () => {
        setStatus('available');
        setLastError(null);

        toast.success(
          'Softphone disponible para recibir llamadas.',
        );
      });

      device.on('unregistered', () => {
        setStatus('offline');
      });

      device.on('incoming', (call) => {
        if (activeCallRef.current) {
          call.reject();
          return;
        }

        configureCallEvents(call);

        setIncomingCall(call);
        setStatus('ringing');
        setExpanded(true);
      });

      device.on('tokenWillExpire', () => {
        void refreshDeviceToken(device);
      });

      device.on('error', (error) => {
        console.error(
          'Twilio Device error:',
          error,
        );

        setStatus('error');
        setLastError(error.message);

        toast.error(
          `Error de telefonía: ${error.message}`,
        );
      });

      await device.register();
    } catch (error) {
      console.error(
        'Error activating softphone:',
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : 'No se pudo activar el softphone.';

      setStatus('error');
      setLastError(message);

      toast.error(message);
    }
  }

  async function deactivateSoftphone() {
    const device = deviceRef.current;

    if (!device) {
      setStatus('offline');
      return;
    }

    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    }

    try {
      await device.unregister();
    } catch (error) {
      console.error(
        'Error unregistering Twilio Device:',
        error,
      );
    }

    device.destroy();

    deviceRef.current = null;
    activeCallRef.current = null;

    setIncomingCall(null);
    setActiveCall(null);
    setIdentity(null);
    setMuted(false);
    setStatus('offline');
  }

  function acceptIncomingCall() {
    if (!incomingCall) return;

    incomingCall.accept();
  }

  function rejectIncomingCall() {
    if (!incomingCall) return;

    incomingCall.reject();
    clearCurrentCall();
  }

  function hangUp() {
    if (!activeCall) return;

    activeCall.disconnect();
  }

  function toggleMute() {
    if (!activeCall) return;

    const nextMutedValue = !muted;

    activeCall.mute(nextMutedValue);
    setMuted(nextMutedValue);
  }

  useEffect(() => {
    return () => {
      const device = deviceRef.current;

      if (activeCallRef.current) {
        activeCallRef.current.disconnect();
      }

      if (device) {
        device.destroy();
      }

      deviceRef.current = null;
      activeCallRef.current = null;
    };
  }, []);

  const statusLabel = {
    offline: 'Desconectado',
    connecting: 'Conectando...',
    available: 'Disponible',
    ringing: 'Llamada entrante',
    in_call: 'En llamada',
    error: 'No configurado',
  }[status];

  const statusClass = {
    offline:
      'bg-muted text-muted-foreground',
    connecting:
      'bg-amber-500/15 text-amber-600 dark:text-amber-300',
    available:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    ringing:
      'bg-primary/15 text-primary',
    in_call:
      'bg-blue-500/15 text-blue-600 dark:text-blue-300',
    error:
      'bg-red-500/15 text-red-600 dark:text-red-300',
  }[status];

  if (!expanded) {
    return (
      <Button
        type="button"
        size="icon"
        onClick={() => setExpanded(true)}
        className="
          fixed bottom-5 right-5 z-50
          size-14 rounded-full shadow-xl
        "
        aria-label="Abrir softphone"
        title="Telefonía Twilio"
      >
        <PhoneCall className="size-6" />
      </Button>
    );
  }

  return (
    <div
      className="
        fixed bottom-5 right-5 z-50
        w-[calc(100vw-2.5rem)]
        max-w-sm
        overflow-hidden rounded-xl
        border border-border
        bg-popover text-popover-foreground
        shadow-2xl
      "
    >
      {/* Encabezado */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <p className="flex items-center gap-2 font-semibold">
            <PhoneCall className="size-4 text-primary" />
            Telefonía
          </p>

          <span
            className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
          >
            {statusLabel}
          </span>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setExpanded(false)}
          aria-label="Minimizar softphone"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {/* Llamada entrante */}
        {incomingCall && status === 'ringing' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/15">
              <Phone className="size-7 animate-pulse text-primary" />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Llamada entrante
              </p>

              <p className="mt-1 text-lg font-semibold">
                {getCallerNumber(incomingCall)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="destructive"
                onClick={rejectIncomingCall}
              >
                <PhoneOff className="size-4" />
                Rechazar
              </Button>

              <Button
                type="button"
                onClick={acceptIncomingCall}
                className="bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Phone className="size-4" />
                Contestar
              </Button>
            </div>
          </div>
        )}

        {/* Llamada activa */}
        {activeCall && status === 'in_call' && (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-blue-500/15">
              <PhoneCall className="size-7 text-blue-500" />
            </div>

            <div>
              <p className="text-sm text-muted-foreground">
                Llamada en curso
              </p>

              <p className="mt-1 text-lg font-semibold">
                {getCallerNumber(activeCall)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={toggleMute}
              >
                {muted ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}

                {muted
                  ? 'Activar audio'
                  : 'Silenciar'}
              </Button>

              <Button
                type="button"
                variant="destructive"
                onClick={hangUp}
              >
                <PhoneOff className="size-4" />
                Colgar
              </Button>
            </div>
          </div>
        )}

        {/* Estado normal */}
        {!incomingCall && !activeCall && (
          <>
            {status === 'available' ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Listo para recibir llamadas
                </p>

                {identity && (
                  <p className="mt-2 break-all text-xs text-muted-foreground">
                    Identidad: {identity}
                  </p>
                )}
              </div>
            ) : status === 'error' ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Telefonía no disponible
                </p>

                <p className="mt-2 text-sm text-muted-foreground">
                  {lastError ||
                    'Completa las credenciales de Twilio para activar el softphone.'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <p className="text-sm font-medium">
                  Softphone desactivado
                </p>

                <p className="mt-1 text-sm text-muted-foreground">
                  Actívalo para recibir llamadas en este navegador.
                </p>
              </div>
            )}

            {status === 'connecting' ? (
              <Button
                type="button"
                className="w-full"
                disabled
              >
                <Loader2 className="size-4 animate-spin" />
                Conectando...
              </Button>
            ) : status === 'available' ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  void deactivateSoftphone()
                }
              >
                <PowerOff className="size-4" />
                Desactivar softphone
              </Button>
            ) : (
              <Button
                type="button"
                className="w-full"
                onClick={() =>
                  void activateSoftphone()
                }
              >
                <Power className="size-4" />
                Activar softphone
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}