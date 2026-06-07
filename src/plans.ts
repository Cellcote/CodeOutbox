// Plan definitions (PRICING.md v2): subscribers + monthly send allowance.
// Free-tier limits are env-overridable (handy for staging / small test instances).

const num = (v: string | undefined, d: number) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
};

export interface Plan {
  name: string;
  subscribers: number; // active subscribers cap
  sends: number; // emails per rolling 30 days
}

export const PLANS: Record<string, Plan> = {
  free: {
    name: "free",
    subscribers: num(process.env.FREE_SUBSCRIBERS, 100),
    sends: num(process.env.FREE_SENDS, 1000),
  },
  pro: { name: "pro", subscribers: 3000, sends: 30000 },
  growth: { name: "growth", subscribers: 10000, sends: 100000 },
  scale: { name: "scale", subscribers: 50000, sends: 500000 },
  business: { name: "business", subscribers: 150000, sends: 1500000 },
  max: { name: "max", subscribers: 500000, sends: 5000000 },
};

export function getPlan(name?: string | null): Plan {
  return (name && PLANS[name]) || PLANS.free;
}
