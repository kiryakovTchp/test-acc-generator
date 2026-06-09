import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import db from './db.js';
import { MailTmProvider } from './providers/mailTmProvider.js';
import { deleteHistory, generateAccount, getHistoryDetail, listGeoRules, listHistory } from './services/accountService.js';
import type { Role } from './types.js';

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
    (req as any).user = decoded;
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
  const item = getHistoryDetail(Number(req.params.id), (req as any).user.userId);
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json(item);
});

app.delete('/history/:id', auth, (req, res) => {
  deleteHistory(Number(req.params.id), (req as any).user.userId);
  res.status(204).send();
});

app.post('/accounts/generate', auth, async (req, res) => {
  const { geoKey, documentType, role } = req.body ?? {};
  try {
    const item = await generateAccount({
      userId: (req as any).user.userId,
      geoKey,
      documentType,
      role: role === 'admin' ? 'admin' : 'user',
      emailProvider,
    });
    res.json(item);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to generate account' });
  }
});

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`backend listening on ${port}`));
}

export default app;
