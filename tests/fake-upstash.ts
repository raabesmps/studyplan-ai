type Command = (string | number)[];

type Entry =
  | { kind: 'string'; value: string; expiresAt: number | null }
  | { kind: 'hash'; fields: Map<string, string>; expiresAt: number | null };

/**
 * An in-memory stand-in for the Upstash REST pipeline endpoint, with a clock the test can move.
 * Supports what the app uses: INCR, GET, SET (EX), DEL, EXPIRE (with NX), TTL, HINCRBY, HGETALL, PING.
 * `handler` is a drop-in `fetch` implementation for it.
 */
export function fakeUpstash() {
  const entries = new Map<string, Entry>();
  let now = Date.parse('2026-03-10T12:00:00Z');
  const requests: { url: string; authorization: string | null; commands: Command[] }[] = [];
  const state = { failWith: null as Response | null, ignoreExpire: false };

  const live = (key: string): Entry | undefined => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now) entries.delete(key);
    return entries.get(key);
  };

  const run = ([name, key, ...args]: Command): unknown => {
    const k = String(key);
    switch (name) {
      case 'PING':
        return { result: 'PONG' };
      case 'INCR': {
        const entry = live(k);
        const next = (entry?.kind === 'string' ? Number(entry.value) : 0) + 1;
        entries.set(k, { kind: 'string', value: String(next), expiresAt: entry?.expiresAt ?? null });
        return { result: next };
      }
      case 'GET': {
        const entry = live(k);
        return { result: entry?.kind === 'string' ? entry.value : null };
      }
      case 'SET': {
        const ex = args.indexOf('EX');
        entries.set(k, { kind: 'string', value: String(args[0]), expiresAt: ex >= 0 ? now + Number(args[ex + 1]) * 1000 : null });
        return { result: 'OK' };
      }
      case 'DEL':
        return { result: entries.delete(k) ? 1 : 0 };
      case 'EXPIRE': {
        const entry = live(k);
        if (!entry || state.ignoreExpire) return { result: 0 };
        if (args[1] === 'NX' && entry.expiresAt !== null) return { result: 0 };
        entry.expiresAt = now + Number(args[0]) * 1000;
        return { result: 1 };
      }
      case 'TTL': {
        const entry = live(k);
        if (!entry) return { result: -2 };
        return { result: entry.expiresAt === null ? -1 : Math.ceil((entry.expiresAt - now) / 1000) };
      }
      case 'HINCRBY': {
        const entry = live(k);
        const hash = entry?.kind === 'hash' ? entry : { kind: 'hash' as const, fields: new Map<string, string>(), expiresAt: null };
        const next = Number(hash.fields.get(String(args[0])) ?? 0) + Number(args[1]);
        hash.fields.set(String(args[0]), String(next));
        entries.set(k, hash);
        return { result: next };
      }
      case 'HGETALL': {
        const entry = live(k);
        return { result: entry?.kind === 'hash' ? [...entry.fields].flat() : [] };
      }
      default:
        return { error: `ERR unknown command '${String(name)}'` };
    }
  };

  const handler = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const commands = JSON.parse(String(init?.body)) as Command[];
    const headers = new Headers(init?.headers);
    requests.push({ url: String(input), authorization: headers.get('authorization'), commands });
    if (state.failWith) return state.failWith.clone();
    return new Response(JSON.stringify(commands.map(run)));
  };

  return {
    handler,
    requests,
    state,
    entries,
    /** Moves the fake clock forward. */
    advance: (seconds: number) => {
      now += seconds * 1000;
    },
    get now() {
      return new Date(now);
    },
    /** Reads a hash as a plain object (numbers), for assertions. */
    hash: (key: string): Record<string, number> => {
      const entry = live(key);
      return entry?.kind === 'hash' ? Object.fromEntries([...entry.fields].map(([f, v]) => [f, Number(v)])) : {};
    },
    /** Reads a string value. */
    string: (key: string): string | null => {
      const entry = live(key);
      return entry?.kind === 'string' ? entry.value : null;
    },
  };
}
