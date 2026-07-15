import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function parseLimit(value: string | null) {
  const parsed = Number.parseInt(
    value ?? '',
    10,
  );

  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    Math.max(parsed, 1),
    MAX_LIMIT,
  );
}

export async function GET(
  request: NextRequest,
) {
  try {
    const ctx = await getCurrentAccount();

    const contactId =
      request.nextUrl.searchParams
        .get('contactId')
        ?.trim() ?? '';

    const limit = parseLimit(
      request.nextUrl.searchParams.get('limit'),
    );

    let query = ctx.supabase
      .from('twilio_calls')
      .select(`
        id,
        contact_id,
        assigned_user_id,
        twilio_call_sid,
        direction,
        from_number,
        to_number,
        call_status,
        duration_seconds,
        started_at,
        answered_at,
        ended_at,
        notes,
        created_at
      `)
      .eq('account_id', ctx.accountId)
      .order('started_at', {
        ascending: false,
      })
      .limit(limit);

    if (contactId) {
      query = query.eq(
        'contact_id',
        contactId,
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error(
        '[GET /api/twilio/calls]',
        error,
      );

      return NextResponse.json(
        {
          error:
            'No se pudo consultar el historial de llamadas.',
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json(
      {
        calls: data ?? [],
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}