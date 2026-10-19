import { deleteCookie, getCookie, setCookie } from "@tanstack/react-start/server";
import { defaults, seal, unseal } from "iron-webcrypto";

type CookieOptions = NonNullable<Parameters<typeof setCookie>[2]>;

interface SealedSessionConfig {
  name: string;
  password: string;
  /** Seconds from the session's creation until it stops opening. */
  maxAge?: number;
  cookie: CookieOptions;
}

interface Envelope<T> {
  id: string;
  createdAt: number;
  data: Partial<T>;
}

/**
 * An encrypted cookie session, standing in for the `useSession` Start dropped at
 * 1.169. It writes the same iron-sealed `{ id, createdAt, data }` envelope with
 * the same expiry rules, so guests who unlocked the site before the upgrade are
 * not sent back to the password page.
 */
export async function useSealedSession<T extends object>(config: SealedSessionConfig) {
  const ttl = config.maxAge ? config.maxAge * 1000 : 0;
  const options = { ...defaults, ttl };

  let session: Envelope<T> = { id: crypto.randomUUID(), createdAt: Date.now(), data: {} };
  const sealed = getCookie(config.name);
  if (sealed) {
    try {
      const opened = (await unseal(sealed, config.password, options)) as Envelope<T>;
      if (!ttl || Date.now() - opened.createdAt <= ttl) {
        session = opened;
      }
    } catch {
      // Tampered, expired or sealed with another secret: start a fresh session.
    }
  }

  return {
    get data() {
      return session.data;
    },
    async update(update: Partial<T>) {
      session.data = { ...session.data, ...update };
      setCookie(config.name, await seal(session, config.password, options), {
        expires: ttl ? new Date(session.createdAt + ttl) : undefined,
        ...config.cookie,
      });
    },
    async clear() {
      session = { id: crypto.randomUUID(), createdAt: Date.now(), data: {} };
      deleteCookie(config.name, config.cookie);
    },
  };
}
