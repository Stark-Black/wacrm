'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  Clock3,
  Loader2,
  PhoneIncoming,
  PhoneOutgoing,
  RefreshCw,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

type TwilioCall = {
  id: string;
  contact_id: string | null;
  assigned_user_id: string | null;
  twilio_call_sid: string | null;
  direction: 'incoming' | 'outgoing';
  from_number: string | null;
  to_number: string | null;
  call_status: string;
  duration_seconds: number | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
};

type CallsResponse = {
  calls?: TwilioCall[];
  error?: string;
};

interface ContactCallHistoryProps {
  contactId: string;
}

function formatDuration(
  durationSeconds: number | null,
) {
  if (
    durationSeconds === null ||
    durationSeconds < 0
  ) {
    return 'Sin duración';
  }

  const hours = Math.floor(
    durationSeconds / 3600,
  );

  const minutes = Math.floor(
    (durationSeconds % 3600) / 60,
  );

  const seconds =
    durationSeconds % 60;

  if (hours > 0) {
    return [
      hours,
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
    ].join(':');
  }

  return [
    minutes,
    seconds.toString().padStart(2, '0'),
  ].join(':');
}

function formatCallDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Fecha desconocida';
  }

  return new Intl.DateTimeFormat(
    'es-PE',
    {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
  ).format(date);
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: 'En cola',
    initiated: 'Iniciando',
    ringing: 'Sonando',
    'in-progress': 'En curso',
    completed: 'Completada',
    busy: 'Ocupado',
    failed: 'Fallida',
    'no-answer': 'No contestada',
    canceled: 'Cancelada',
    'no-agent-available':
      'Sin asesor disponible',
  };

  return labels[status] ?? status;
}

function getStatusClass(status: string) {
  switch (status) {
    case 'completed':
      return [
        'border-emerald-500/30',
        'bg-emerald-500/10',
        'text-emerald-600',
        'dark:text-emerald-300',
      ].join(' ');

    case 'in-progress':
      return [
        'border-blue-500/30',
        'bg-blue-500/10',
        'text-blue-600',
        'dark:text-blue-300',
      ].join(' ');

    case 'queued':
    case 'initiated':
    case 'ringing':
      return [
        'border-amber-500/30',
        'bg-amber-500/10',
        'text-amber-600',
        'dark:text-amber-300',
      ].join(' ');

    case 'failed':
      return [
        'border-red-500/30',
        'bg-red-500/10',
        'text-red-600',
        'dark:text-red-300',
      ].join(' ');

    default:
      return [
        'border-border',
        'bg-muted',
        'text-muted-foreground',
      ].join(' ');
  }
}

function getOtherNumber(call: TwilioCall) {
  if (call.direction === 'incoming') {
    return call.from_number || 'Número desconocido';
  }

  return call.to_number || 'Número desconocido';
}

export function ContactCallHistory({
  contactId,
}: ContactCallHistoryProps) {
  const [calls, setCalls] =
    useState<TwilioCall[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  const loadCalls = useCallback(
    async () => {
      setLoading(true);
      setError(null);

      try {
        const searchParams =
          new URLSearchParams({
            contactId,
            limit: '50',
          });

        const response = await fetch(
          `/api/twilio/calls?${searchParams.toString()}`,
          {
            method: 'GET',
            cache: 'no-store',
          },
        );

        const data =
          (await response.json()) as CallsResponse;

        if (!response.ok) {
          throw new Error(
            data.error ||
              'No se pudo cargar el historial.',
          );
        }

        setCalls(data.calls ?? []);
      } catch (loadError) {
        console.error(
          'Error loading contact calls:',
          loadError,
        );

        setError(
          loadError instanceof Error
            ? loadError.message
            : 'No se pudo cargar el historial.',
        );
      } finally {
        setLoading(false);
      }
    },
    [contactId],
  );

  useEffect(() => {
    void loadCalls();
  }, [loadCalls]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-lg border border-red-500/30 bg-red-500/5 p-4">
        <p className="text-sm text-red-600 dark:text-red-300">
          {error}
        </p>

        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            void loadCalls();
          }}
        >
          <RefreshCw className="size-4" />
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">
            Historial de llamadas
          </p>

          <p className="text-xs text-muted-foreground">
            {calls.length}{' '}
            {calls.length === 1
              ? 'llamada registrada'
              : 'llamadas registradas'}
          </p>
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => {
            void loadCalls();
          }}
          aria-label="Actualizar historial"
          title="Actualizar historial"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {calls.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <PhoneIncoming className="mx-auto size-8 text-muted-foreground" />

          <p className="mt-3 text-sm font-medium">
            Todavía no hay llamadas
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Las llamadas entrantes y salientes de
            este contacto aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {calls.map((call) => {
            const incoming =
              call.direction === 'incoming';

            const DirectionIcon = incoming
              ? PhoneIncoming
              : PhoneOutgoing;

            return (
              <div
                key={call.id}
                className="rounded-lg border border-border bg-muted/30 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <DirectionIcon className="size-4 text-primary" />
                    </div>

                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {incoming
                          ? 'Llamada entrante'
                          : 'Llamada saliente'}
                      </p>

                      <p className="truncate text-sm text-muted-foreground">
                        {getOtherNumber(call)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={[
                      'shrink-0 rounded-full',
                      'border px-2 py-0.5',
                      'text-[11px] font-medium',
                      getStatusClass(
                        call.call_status,
                      ),
                    ].join(' ')}
                  >
                    {getStatusLabel(
                      call.call_status,
                    )}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock3 className="size-3.5" />

                    {formatCallDate(
                      call.started_at,
                    )}
                  </span>

                  <span>
                    Duración:{' '}
                    {formatDuration(
                      call.duration_seconds,
                    )}
                  </span>
                </div>

                {call.notes && (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                    {call.notes}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}