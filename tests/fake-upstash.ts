type Command = (string | number)[];

/**
 * An in-memory stand-in for the Upstash REST pipeline endpoint: INCR, EXPIRE (with NX) and TTL,
 * with a clock the test can move. `handler` is a drop-in `fetch` implementation for it.
 */
export function fakeUpstash() {
  const entries = new Map<string, { value: number; expiresAt: number | null }>();
  let now = Date.parse('2026-03-10T12:00:00Z');
  const requests: { url: string; authorization: string | null; commands: Command[] }[] = [];
  const state = { failWith: null as Response | null, ignoreExpire: false };

  const live = (key: string) => {
    const entry = entries.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now) entries.delete(key);
    return entries.get(key);
  };

  const run = ([name, key, ...args]: Command): unknown => {
    const k = String(key);
    if (name === 'INCR') {
      const entry = live(k) ?? { value: 0, expiresAt: null };
      entry.value += 1;
      entries.set(k, entry);
      return { result: entry.value };
    }
    if (name === 'EXPIRE') {
      const entry = live(k);
      if (!entry || state.ignoreExpire) return { result: 0 };
      if (args[1] === 'NX' && entry.expiresAt !== null) return { result: 0 };
      entry.expiresAt = now + Number(args[0]) * 1000;
      return { result: 1 };
    }
    if (name === 'TTL') {
      const entry = live(k);
      if (!entry) return { result: -2 };
      return { result: entry.expiresAt === null ? -1 : Math.ceil((entry.expiresAt - now) / 1000) };
    }
    return { error: `ERR unknown command '${String(name)}'` };
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
  };
}
