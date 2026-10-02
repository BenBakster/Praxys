import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';

const COOKIE_NAME = 'praxis_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const FAILED_LOGIN_LIMIT = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function digest(secret: string, value: string): Buffer {
  return createHmac('sha256', secret).update(value).digest();
}

function readCookie(req: Request, name: string): string {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

// Single shared password for the whole app; registered before every other /api route.
export function installPasswordGate(app: Express, password: string, secureCookie: boolean) {
  // Changing APP_PASSWORD invalidates every issued session.
  const sessionToken = digest(password, 'praxis-session-v1').toString('hex');
  const failedLogins = new Map<string, { count: number; since: number }>();

  app.post('/api/login', (req: Request, res: Response) => {
    const clientKey = req.ip || 'unknown';
    const now = Date.now();
    const failures = failedLogins.get(clientKey);
    if (failures && now - failures.since < FAILED_LOGIN_WINDOW_MS && failures.count >= FAILED_LOGIN_LIMIT) {
      return res.status(429).json({ ok: false, error: 'Забагато невдалих спроб. Спробуйте через 15 хвилин.' });
    }

    const attempt = typeof req.body?.password === 'string' ? req.body.password : '';
    const isValid = timingSafeEqual(digest(sessionToken, attempt), digest(sessionToken, password));
    if (!isValid) {
      const fresh = !failures || now - failures.since >= FAILED_LOGIN_WINDOW_MS;
      failedLogins.set(clientKey, fresh ? { count: 1, since: now } : { count: failures.count + 1, since: failures.since });
      console.warn(`[Auth] Failed login from ${clientKey}`);
      return res.status(401).json({ ok: false, error: 'Невірний пароль.' });
    }

    failedLogins.delete(clientKey);
    res.setHeader(
      'Set-Cookie',
      `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE_SECONDS}${secureCookie ? '; Secure' : ''}`
    );
    return res.json({ ok: true });
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const presented = readCookie(req, COOKIE_NAME);
    if (presented && timingSafeEqual(digest(sessionToken, presented), digest(sessionToken, sessionToken))) {
      return next();
    }
    return res.status(401).json({ ok: false, error: 'Потрібно увійти: оновіть сторінку та введіть пароль.' });
  });
}
