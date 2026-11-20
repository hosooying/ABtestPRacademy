import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  CONCESSION_RULES,
  SUBSCRIPTION_PLANS,
  UPCOMING_CLASSES,
  checkExistingStudent,
  computeAge,
  computeConcession,
} from './src/data/academyData.ts';
import type { BillingBasis, PlanId } from './src/types.ts';

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || 'pr-academy-session-secret-2026';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'academy-store.json');

interface StoredUser {
  id: string;
  fullName: string;
  email: string;
  dob: string;
  studentId: string | null;
  isExistingStudent: boolean;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
}

interface StoredOrder {
  orderNumber: string;
  userId: string;
  planId: PlanId;
  planName: string;
  billingBasis: BillingBasis;
  termUnits: number;
  unitLabel: string;
  unitPrice: number;
  subtotal: number;
  discountRate: number;
  discountLabel: string;
  discountAmount: number;
  totalAmount: number;
  learningMode: 'In-Person (Singapore)' | 'Live Interactive Stream';
  startDate: string;
  paymentMethod: 'Card' | 'PayNow';
  paymentLast4?: string;
  billingPostalCode: string;
  billingAddress: string;
  status: 'Active' | 'Confirmed';
  createdAt: string;
  ageAtPurchase: number;
}

interface StoreState {
  users: StoredUser[];
  orders: StoredOrder[];
  orderSeq: number;
}

function hashPassword(password: string, salt?: string) {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash, salt: actualSalt };
}

function verifyPassword(password: string, hash: string, salt: string): boolean {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
}

function signPayload(payload: object): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySignedPayload<T>(token: string): T | null {
  try {
    const [data, sig] = token.split('.');
    if (!data || !sig) return null;
    const expected = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

function seedDefaultStore(): StoreState {
  const seededUsers: StoredUser[] = [
    (() => {
      const { hash, salt } = hashPassword('Pass1234!');
      return {
        id: 'usr_weiming',
        fullName: 'Tan Wei Ming',
        email: 'weiming.tan@example.sg',
        dob: '1981-04-12',
        studentId: null,
        isExistingStudent: false,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: '2026-10-02T08:15:00.000Z',
      };
    })(),
    (() => {
      const { hash, salt } = hashPassword('Pass1234!');
      return {
        id: 'usr_huiling',
        fullName: 'Lim Hui Ling',
        email: 'huiling.lim@example.sg',
        dob: '1998-09-23',
        studentId: 'PR-2024-089',
        isExistingStudent: true,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: '2026-09-14T11:30:00.000Z',
      };
    })(),
    (() => {
      const { hash, salt } = hashPassword('Pass1234!');
      return {
        id: 'usr_rajesh',
        fullName: 'Dr. Rajesh Nair',
        email: 'rajesh.nair@example.sg',
        dob: '1978-07-08',
        studentId: 'PR-2023-104',
        isExistingStudent: true,
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: '2026-08-21T09:00:00.000Z',
      };
    })(),
  ];

  const seededOrders: StoredOrder[] = [
    {
      orderNumber: 'PR-2026-1018',
      userId: 'usr_huiling',
      planId: 'monthly',
      planName: 'Monthly Fellowship',
      billingBasis: 'monthly',
      termUnits: 3,
      unitLabel: 'month',
      unitPrice: 260,
      subtotal: 780,
      discountRate: 0.15,
      discountLabel: 'Existing Student Alumni Concession (15% Off)',
      discountAmount: 117,
      totalAmount: 663,
      learningMode: 'In-Person (Singapore)',
      startDate: '2026-10-01',
      paymentMethod: 'PayNow',
      billingPostalCode: '238801',
      billingAddress: '9 Penang Road, Singapore',
      status: 'Active',
      createdAt: '2026-09-14T11:42:00.000Z',
      ageAtPurchase: 27,
    },
  ];

  return {
    users: seededUsers,
    orders: seededOrders,
    orderSeq: 1042,
  };
}

let storeCache: StoreState | null = null;

function loadStore(): StoreState {
  if (storeCache) return storeCache;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      storeCache = JSON.parse(raw) as StoreState;
      return storeCache;
    }
  } catch {
    // Fall back to default seeded state
  }
  storeCache = seedDefaultStore();
  saveStore(storeCache);
  return storeCache;
}

function saveStore(state: StoreState): void {
  storeCache = state;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Keep operating cleanly in memory if filesystem is read-only
  }
}

function toPublicUser(user: StoredUser) {
  const concession = computeConcession(user.dob, user.isExistingStudent, user.studentId);
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    dob: user.dob,
    concession,
    createdAt: user.createdAt,
  };
}

function toPublicOrder(order: StoredOrder & { verifiedAgeAtPurchase?: number }) {
  return {
    ...order,
    ageAtPurchase: order.ageAtPurchase ?? order.verifiedAgeAtPurchase ?? 0,
  };
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = decodeURIComponent(part.slice(idx + 1).trim());
      result[k] = v;
    }
  }
  return result;
}

function getAuthenticatedUser(req: Request): StoredUser | null {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const token = bearerToken || cookies.pr_session;
  if (!token) return null;

  const decoded = verifySignedPayload<{ userId: string; exp: number }>(token);
  if (!decoded?.userId) return null;

  const store = loadStore();
  return store.users.find((u) => u.id === decoded.userId) || null;
}

function issueSession(res: Response, user: StoredUser): string {
  const token = signPayload({
    userId: user.id,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  res.cookie('pr_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });
  return token;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Catalog & metadata endpoint
  app.get('/api/catalog', (_req: Request, res: Response) => {
    res.json({
      plans: SUBSCRIPTION_PLANS,
      classes: UPCOMING_CLASSES,
      concessionRules: CONCESSION_RULES,
    });
  });

  // Standard learner registration with DOB & optional Student ID
  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { fullName, email, password, dob, studentId } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      dob?: string;
      studentId?: string;
    };

    if (!fullName || fullName.trim().length < 2) {
      res.status(400).json({ error: 'Please enter your full name.' });
      return;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    if (!password || password.length < 8) {
      res.status(400).json({ error: 'Please create a password of at least 8 characters.' });
      return;
    }

    if (!dob || computeAge(dob) === null) {
      res.status(400).json({ error: 'Please enter a valid Date of Birth.' });
      return;
    }

    const studentCheck = checkExistingStudent(studentId);
    if (studentId && studentId.trim() && !studentCheck.valid) {
      res.status(400).json({
        error: 'Student ID not found in PR Academy Alumni Registry (try e.g. PR-2024-089 or leave blank if new).',
      });
      return;
    }

    const store = loadStore();
    const emailLower = email.trim().toLowerCase();

    if (store.users.some((u) => u.email.toLowerCase() === emailLower)) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
      return;
    }

    const { hash, salt } = hashPassword(password);
    const newUser: StoredUser = {
      id: `usr_${crypto.randomUUID().slice(0, 8)}`,
      fullName: fullName.trim(),
      email: emailLower,
      dob: dob.trim(),
      studentId: studentCheck.normalized,
      isExistingStudent: studentCheck.valid,
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    store.users.push(newUser);
    saveStore(store);

    const sessionToken = issueSession(res, newUser);
    res.status(201).json({
      user: toPublicUser(newUser),
      orders: [],
      sessionToken,
    });
  });

  // Standard Login with Email + Password
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, identifier, password } = req.body as {
      email?: string;
      identifier?: string;
      password?: string;
    };
    const rawEmail = email || identifier;
    if (!rawEmail || !password) {
      res.status(400).json({ error: 'Please enter your email address and password.' });
      return;
    }

    const norm = rawEmail.trim().toLowerCase();
    const store = loadStore();
    const user = store.users.find((u) => u.email.toLowerCase() === norm);

    if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      res.status(401).json({ error: 'Incorrect email or password.' });
      return;
    }

    const sessionToken = issueSession(res, user);
    const orders = store.orders.filter((o) => o.userId === user.id).map(toPublicOrder);
    res.json({
      user: toPublicUser(user),
      orders,
      sessionToken,
    });
  });

  // Link Existing Student ID for logged-in user
  app.post('/api/auth/verify-student', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ error: 'Please sign in first.' });
      return;
    }

    const { studentId } = req.body as { studentId?: string };
    const check = checkExistingStudent(studentId);
    if (!check.valid || !check.normalized) {
      res.status(400).json({
        error: 'Student ID not found in the PR Academy Alumni Registry (e.g. PR-2024-089).',
      });
      return;
    }

    const store = loadStore();
    const target = store.users.find((u) => u.id === user.id);
    if (!target) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    target.isExistingStudent = true;
    target.studentId = check.normalized;
    saveStore(store);

    res.json({ user: toPublicUser(target) });
  });

  // Current Session
  app.get('/api/auth/me', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.json({ user: null, orders: [] });
      return;
    }
    const store = loadStore();
    const orders = store.orders.filter((o) => o.userId === user.id).map(toPublicOrder);
    res.json({ user: toPublicUser(user), orders });
  });

  // Logout
  app.post('/api/auth/logout', (_req: Request, res: Response) => {
    res.clearCookie('pr_session', { path: '/' });
    res.json({ ok: true });
  });

  // Checkout & Subscription Enrollment
  app.post('/api/checkout', (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({
        error: 'Please sign in or create an account to complete subscription checkout.',
      });
      return;
    }

    const {
      planId,
      termUnits,
      learningMode,
      startDate,
      paymentMethod,
      cardNumber,
      cardExpiry,
      cardCvc,
      billingPostalCode,
      billingAddress,
    } = req.body as {
      planId?: PlanId;
      termUnits?: number;
      learningMode?: 'In-Person (Singapore)' | 'Live Interactive Stream';
      startDate?: string;
      paymentMethod?: 'Card' | 'PayNow';
      cardNumber?: string;
      cardExpiry?: string;
      cardCvc?: string;
      billingPostalCode?: string;
      billingAddress?: string;
    };

    const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
    if (!plan) {
      res.status(400).json({ error: 'Please select a valid subscription plan.' });
      return;
    }

    const units = Number(termUnits);
    if (!Number.isInteger(units) || units < plan.minUnits || units > plan.maxUnits) {
      res.status(400).json({
        error: `${plan.name} requires between ${plan.minUnits} and ${plan.maxUnits} ${plan.unitLabel}(s).`,
      });
      return;
    }

    if (!billingPostalCode || !/^\d{5,6}$/.test(billingPostalCode.trim())) {
      res.status(400).json({ error: 'Please enter a valid 6-digit Singapore postal code.' });
      return;
    }

    if (!billingAddress || billingAddress.trim().length < 5) {
      res.status(400).json({ error: 'Please enter your billing street address.' });
      return;
    }

    const method = paymentMethod === 'PayNow' ? 'PayNow' : 'Card';
    let paymentLast4: string | undefined;

    if (method === 'Card') {
      const digits = (cardNumber || '').replace(/\s+/g, '');
      if (!/^\d{13,19}$/.test(digits)) {
        res.status(400).json({ error: 'Please enter a valid card number.' });
        return;
      }
      if (!cardExpiry || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(cardExpiry.trim())) {
        res.status(400).json({ error: 'Please enter card expiry in MM/YY format.' });
        return;
      }
      if (!cardCvc || !/^\d{3,4}$/.test(cardCvc.trim())) {
        res.status(400).json({ error: 'Please enter a valid 3 or 4 digit security code.' });
        return;
      }
      paymentLast4 = digits.slice(-4);
    }

    const concession = computeConcession(user.dob, user.isExistingStudent, user.studentId);
    const subtotal = plan.unitPrice * units;
    const discountAmount = Math.round(subtotal * concession.appliedRate * 100) / 100;
    const totalAmount = Math.round((subtotal - discountAmount) * 100) / 100;

    const store = loadStore();
    store.orderSeq += 1;
    const orderNumber = `PR-2026-${store.orderSeq}`;

    const newOrder: StoredOrder = {
      orderNumber,
      userId: user.id,
      planId: plan.id,
      planName: plan.name,
      billingBasis: plan.billingBasis,
      termUnits: units,
      unitLabel: plan.unitLabel,
      unitPrice: plan.unitPrice,
      subtotal,
      discountRate: concession.appliedRate,
      discountLabel: concession.label,
      discountAmount,
      totalAmount,
      learningMode:
        learningMode === 'Live Interactive Stream'
          ? 'Live Interactive Stream'
          : 'In-Person (Singapore)',
      startDate: startDate || new Date().toISOString().slice(0, 10),
      paymentMethod: method,
      paymentLast4,
      billingPostalCode: billingPostalCode.trim(),
      billingAddress: billingAddress.trim(),
      status: 'Active',
      createdAt: new Date().toISOString(),
      ageAtPurchase: concession.age,
    };

    store.orders.unshift(newOrder);
    saveStore(store);

    res.status(201).json({ order: newOrder });
  });

  // Healthcheck
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'An unexpected server error occurred.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PR Academy server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
