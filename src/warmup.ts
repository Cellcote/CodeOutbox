// IP/domain warmup. A fresh sending IP must ramp volume gradually or mailbox
// providers throttle/spam it. This caps total daily sends across the shared MTA
// on a ~2-week curve, auto-starting from the first broadcast and graduating to
// no cap once the schedule completes. Disable with WARMUP_ENABLED=false.

import { queryOne } from "./db";
import { config } from "./config";

// Daily send cap by day index (0-based) since the first broadcast.
const RAMP = [
  50, 100, 200, 400, 800, 1500, 3000, 6000, 10000, 15000, 25000, 40000, 70000,
  100000,
];

export interface WarmupStatus {
  active: boolean; // is a cap currently in effect?
  day: number; // 1-based day of warmup (0 = disabled)
  cap: number | null; // today's ceiling; null = no cap (graduated/disabled)
  usedToday: number; // sends counted today across all accounts
  remaining: number | null; // cap - usedToday; null = unlimited
  graduated: boolean; // schedule complete
}

function dayStartUTC(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function warmupStatus(): Promise<WarmupStatus> {
  if (!config.send.warmupEnabled) {
    return {
      active: false,
      day: 0,
      cap: null,
      usedToday: 0,
      remaining: null,
      graduated: false,
    };
  }

  const row = await queryOne<{ first_send: string | null; used_today: string }>(
    `SELECT MIN(sent_at) AS first_send,
            COALESCE(SUM(sent_count) FILTER (WHERE sent_at >= date_trunc('day', now())), 0) AS used_today
       FROM broadcasts WHERE sent_at IS NOT NULL`,
  );
  const usedToday = Number(row?.used_today ?? 0);

  // No sends yet → day 1.
  if (!row?.first_send) {
    return {
      active: true,
      day: 1,
      cap: RAMP[0],
      usedToday: 0,
      remaining: RAMP[0],
      graduated: false,
    };
  }

  const dayIdx = Math.max(
    0,
    Math.floor((Date.now() - dayStartUTC(new Date(row.first_send))) / 86_400_000),
  );
  if (dayIdx >= RAMP.length) {
    return {
      active: false,
      day: dayIdx + 1,
      cap: null,
      usedToday,
      remaining: null,
      graduated: true,
    };
  }
  const cap = RAMP[dayIdx];
  return {
    active: true,
    day: dayIdx + 1,
    cap,
    usedToday,
    remaining: Math.max(0, cap - usedToday),
    graduated: false,
  };
}

// Throw if this broadcast would breach today's warmup cap.
export async function enforceWarmup(recipientCount: number): Promise<void> {
  const w = await warmupStatus();
  if (w.active && w.remaining !== null && recipientCount > w.remaining) {
    throw new Error(
      `warmup limit reached: day ${w.day} cap is ${w.cap}/day across the shared IP, ` +
        `${w.usedToday} already sent today — this broadcast needs ${recipientCount}. ` +
        `Spread it across days while the IP warms up (or set WARMUP_ENABLED=false to override).`,
    );
  }
}
