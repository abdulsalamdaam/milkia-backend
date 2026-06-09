/**
 * Expo push notifications. The mobile app (Expo) registers an
 * `ExponentPushToken[…]` via POST /tenant/me/fcm-token; we deliver through
 * Expo's push service. Fire-and-forget: callers `void sendExpoPush(...)` so a
 * slow/failed push never blocks the request.
 */

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: "default" | null;
  data?: Record<string, unknown>;
  badge?: number;
}

export interface ExpoPushResult {
  ok: boolean;
  sent: number;
  response: unknown;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Send one or more Expo push messages. Invalid/empty tokens are dropped. */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoPushResult> {
  const valid = messages.filter((m) => typeof m.to === "string" && m.to.trim().length > 0);
  if (valid.length === 0) return { ok: false, sent: 0, response: { error: "no push tokens" } };
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(valid.map((m) => ({ sound: "default", ...m }))),
    });
    const response = await res.json().catch(() => ({}));
    return { ok: res.ok, sent: valid.length, response };
  } catch (err: any) {
    return { ok: false, sent: 0, response: { error: String(err?.message ?? err) } };
  }
}

/** Convenience for a single recipient. */
export function sendExpoPushTo(token: string | null | undefined, title: string, body: string, data?: Record<string, unknown>) {
  if (!token) return Promise.resolve<ExpoPushResult>({ ok: false, sent: 0, response: { error: "no token" } });
  return sendExpoPush([{ to: token, title, body, data }]);
}
