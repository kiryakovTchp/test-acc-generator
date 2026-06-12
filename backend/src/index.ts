import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { MailTmProvider } from './providers/mailTmProvider.js';
import { buildInboxPayload, deleteHistory, generateAccount, getHistoryDetail, listGeoRules, listHistory, refreshInbox, updateSiteAccountId } from './services/accountService.js';
import type { PersonaKey, Role } from './types.js';
import db from './db.js';

const app = express();
const port = Number(process.env.PORT ?? 4000);
const jwtSecret = process.env.JWT_SECRET ?? 'dev-secret';
const emailProvider = new MailTmProvider();

app.use(cors());
app.use(express.json());

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, jwtSecret) as { userId: number; login: string; role: Role };
    const user = db.prepare('SELECT id, login, role FROM users WHERE id = ? OR login = ? LIMIT 1').get(decoded.userId, decoded.login) as { id: number; login: string; role: Role } | undefined;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    (req as any).user = { userId: user.id, login: user.login, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/auth/login', (req, res) => {
  const { login, password } = req.body ?? {};
  const user = db.prepare('SELECT id, login, password, role FROM users WHERE login = ?').get(login) as any;
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id, login: user.login, role: user.role }, jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { login: user.login, role: user.role } });
});

app.get('/geo-rules', auth, (_req, res) => res.json({ items: listGeoRules() }));

app.get('/history', auth, (req, res) => {
  res.json({ items: listHistory((req as any).user.userId) });
});

app.get('/history/:id', auth, (req, res) => {
  const includeDebug = req.query.debug === '1';
  const item = getHistoryDetail(Number(req.params.id), (req as any).user.userId, includeDebug);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.post('/mailboxes/create', auth, async (_req, res) => {
  try {
    const mailbox = await emailProvider.createAccount();
    res.json(mailbox);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to create mailbox' });
  }
});

app.post('/mailboxes/inbox', auth, async (req, res) => {
  const address = String(req.body?.address ?? '').trim();
  const password = String(req.body?.password ?? '');
  const waitMs = Math.min(60000, Math.max(0, Number(req.body?.waitMs ?? 0)));
  if (!address || !password) {
    return res.status(400).json({ error: 'Mailbox address and password are required' });
  }
  try {
    const inbox = await emailProvider.fetchInbox(address, password, waitMs);
    res.json(buildInboxPayload(inbox));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to fetch mailbox inbox' });
  }
});

app.post('/history/:id/refresh-inbox', auth, async (req, res) => {
  const waitMs = Math.min(60000, Math.max(0, Number(req.body?.waitMs ?? 0)));
  const includeDebug = req.query.debug === '1';
  try {
    const item = await refreshInbox(Number(req.params.id), (req as any).user.userId, emailProvider, waitMs, includeDebug);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to refresh inbox' });
  }
});

app.patch('/history/:id/account-id', auth, (req, res) => {
  const includeDebug = req.query.debug === '1';
  const item = updateSiteAccountId(Number(req.params.id), (req as any).user.userId, String(req.body?.siteAccountId ?? ''), includeDebug);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.delete('/history/:id', auth, (req, res) => {
  deleteHistory(Number(req.params.id), (req as any).user.userId);
  res.status(204).send();
});

app.post('/accounts/generate', auth, async (req, res) => {
  const { geoKey, documentType, role, persona } = req.body ?? {};
  try {
    const item = await generateAccount({
      userId: (req as any).user.userId,
      geoKey,
      documentType,
      role: role === 'admin' ? 'admin' : 'user',
      persona: isPersona(persona) ? persona : 'standard_user',
      emailProvider,
      includeDebug: req.query.debug === '1',
    });
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to generate account' });
  }
});

app.post('/accounts/generate-bulk', auth, async (req, res) => {
  const { geoKey, documentType, role, persona } = req.body ?? {};
  const requestedCount = Number(req.body?.count ?? 1);
  const count = Number.isFinite(requestedCount) ? Math.min(25, Math.max(1, Math.floor(requestedCount))) : 1;
  try {
    const items = [];
    for (let index = 0; index < count; index += 1) {
      items.push(await generateAccount({
        userId: (req as any).user.userId,
        geoKey,
        documentType,
        role: role === 'admin' ? 'admin' : 'user',
        persona: isPersona(persona) ? persona : 'standard_user',
        emailProvider,
        includeDebug: false,
      }));
    }
    res.json({ items });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to generate accounts' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`backend listening on ${port}`));
}

export default app;

function isPersona(value: unknown): value is PersonaKey {
  return ['standard_user', 'young_user', 'senior_user', 'male_user', 'female_user'].includes(String(value));
}
