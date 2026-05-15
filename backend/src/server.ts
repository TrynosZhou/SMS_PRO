import 'reflect-metadata';
console.log('[Server] ✓ reflect-metadata loaded');

import express from 'express';
console.log('[Server] ✓ express loaded');

import cors from 'cors';
console.log('[Server] ✓ cors loaded');

import dotenv from 'dotenv';
console.log('[Server] ✓ dotenv loaded');

console.log('[Server] Loading database configuration...');
import { AppDataSource } from './config/database';
console.log('[Server] ✓ Database configuration imported');

import routes from './routes';
console.log('[Server] ✓ Routes loaded');

import { syncStoredStudentNumbersWithSettingsPrefix } from './utils/syncStudentNumbersWithSettingsPrefix';
import { syncStoredTeacherIdsWithSettingsPrefix } from './utils/syncStoredTeacherIdsWithSettingsPrefix';
import { ensureTeacherGenderColumn } from './utils/ensureTeacherGenderColumn';
import { ensureTeacherMaritalStatusColumn } from './utils/ensureTeacherMaritalStatusColumn';
import { ensureSubjectShortTitleColumn } from './utils/ensureSubjectShortTitleColumn';
import { ensureSubjectDepartmentIdColumn } from './utils/ensureSubjectDepartmentIdColumn';
import { ensureSchoolMottoColumns } from './utils/ensureSchoolMottoColumns';
import { ensureMessageAttachmentUrlColumn } from './utils/ensureMessageAttachmentUrlColumn';
import { ensureClassTimeOffGridColumn } from './utils/ensureClassTimeOffGridColumn';
import { ensureTimetableSlotNoUniqueCollision } from './utils/ensureTimetableSlotNoUniqueCollision';
import { ensureFurnitureCurrentTeacherColumn } from './utils/ensureFurnitureCurrentTeacherColumn';
import { ensureInvoiceFeeLineItemsColumn } from './utils/ensureInvoiceFeeLineItemsColumn';
import { ensureGradeBandsColumn } from './utils/ensureGradeBandsColumn';
import { repairUserActivityLogUserIdsBeforeSync } from './utils/repairUserActivityLogUserIdsBeforeSync';

import * as path from 'path';
import * as fs from 'fs';

// =================== ENVIRONMENT SETUP ===================
// Load .env from backend root (works for `node dist/server.js` and `nodemon src/server.ts`)
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[Server] No .env at', envPath, '(cwd:', process.cwd(), ') — using default dotenv lookup');
  }
}

// Validate required environment variables
const hasDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());
const hasDiscreteDb =
  Boolean(process.env.DB_HOST?.trim()) &&
  Boolean(process.env.DB_USERNAME?.trim()) &&
  process.env.DB_PASSWORD !== undefined &&
  String(process.env.DB_PASSWORD).trim() !== '' &&
  Boolean(process.env.DB_NAME?.trim());

const missingJwt = !process.env.JWT_SECRET?.trim();
const missingDb = !hasDatabaseUrl && !hasDiscreteDb;

if (missingJwt || missingDb) {
  console.error('❌ Missing required environment variables:');
  if (missingJwt) {
    console.error('   - JWT_SECRET');
  }
  if (missingDb) {
    console.error(
      '   - DATABASE_URL (recommended for Render), or all of: DB_HOST, DB_USERNAME, DB_PASSWORD, DB_NAME'
    );
  }
  process.exit(1);
}

// Validate JWT_SECRET
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  console.warn('⚠️ JWT_SECRET should be at least 32 characters long');
}

// =================== APP SETUP ===================
const app = express();

// CORS setup — normalize so https://app.com and https://app.com/ both match
function normalizeOriginUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

const corsExtraFromEnv = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => normalizeOriginUrl(s))
  .filter(Boolean);

const allowedOrigins = Array.from(
  new Set(
    [
      'https://sms-apua.vercel.app',
      'http://localhost:4200',
      'http://localhost:4201',
      'http://localhost:3000',
      ...(process.env.FRONTEND_URL ? [normalizeOriginUrl(process.env.FRONTEND_URL)] : []),
      ...corsExtraFromEnv,
    ].filter(Boolean)
  )
);

if (process.env.NODE_ENV === 'production') {
  console.log(
    `[CORS] Allowed origins (${allowedOrigins.length}):`,
    allowedOrigins.join(', ')
  );
}

const corsDebug = process.env.CORS_DEBUG === 'true';

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      if (corsDebug) {
        console.log('[CORS] allowed (dev):', origin);
      }
      return callback(null, true);
    }

    const normalized = normalizeOriginUrl(origin);

    // In production, restrict to allowed list (+ any *.vercel.app preview/production URL)
    const isAllowed =
      allowedOrigins.includes(normalized) ||
      origin.includes('.vercel.app');

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn('[CORS] blocked origin:', origin);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Disable caching on auth routes to prevent Cloudflare caching responses
app.use('/api/auth', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// All repo uploads (students/, payrolls/, messages/, logos at repo root, etc.)
const uploadsRoot = path.join(__dirname, '../../uploads');
console.log('[Server] Serving /uploads from:', uploadsRoot);
for (const sub of ['students', 'payrolls', 'messages']) {
  try {
    const p = path.join(uploadsRoot, sub);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
  } catch (e) {
    console.warn('[Server] Could not ensure uploads subdirectory exists:', sub, e);
  }
}
app.use('/uploads', express.static(uploadsRoot));

// =================== ROUTES ===================
app.use('/api', routes);

// Health check (publicSignupRoles matches POST /auth/register self-registration)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'School Management System API',
    publicSignupRoles: ['student', 'parent'],
    gitCommit: process.env.RENDER_GIT_COMMIT || undefined,
  });
});

// Debug route for exams
app.get('/api/exams/test', (req, res) => {
  res.json({ message: 'Exam routes are working', path: req.path });
});

// Root
app.get('/', (req, res) => {
  res.send('<h1>School Management System API</h1><p>Use /api/... endpoints to interact.</p>');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found', path: req.path, method: req.method });
});

// Optional: global error handler (for thrown errors in routes)
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
  ) => {
    console.error('[Server] ✗ EXPRESS ERROR HANDLER:');
    console.error('  Path:', req.path);
    console.error('  Method:', req.method);
    console.error('  Error message:', err?.message);
    console.error('  Stack:', err?.stack);
    res.status(500).json({ message: 'Internal server error', error: err?.message || 'Unknown error' });
  }
);

// =================== DATABASE & SERVER ===================
const PORT = process.env.PORT || 3007;

console.log('[Server] Starting database initialization...');
console.log('[Server] Node version:', process.version);

console.log('[Server] Platform:', process.platform);
console.log('[Server] Architecture:', process.arch);
console.log('[Server] Current working directory:', process.cwd());
console.log('[Server] AppDataSource type:', typeof AppDataSource);
console.log('[Server] AppDataSource.isInitialized before:', AppDataSource.isInitialized);

// Global process-level error listeners
process.on('uncaughtException', (error) => {
  console.error('[Server] ✗ UNCAUGHT EXCEPTION:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] ✗ UNHANDLED REJECTION:', { reason, promise });
});

// Wrap everything in an async bootstrap function
async function bootstrap() {
  try {
    // Always run before init on Postgres: sync is gated by env (often not exactly the string "true")
    // and NULL userId rows block TypeORM from tightening NOT NULL on user_activity_logs.
    if (AppDataSource.options.type === 'postgres') {
      try {
        console.log('[Server] Pre-sync: user_activity_logs userId cleanup (if needed)...');
        await repairUserActivityLogUserIdsBeforeSync();
      } catch (repairErr: any) {
        console.warn('[Server] repairUserActivityLogUserIdsBeforeSync:', repairErr?.message || repairErr);
      }
    }
    console.log('[Server] Calling AppDataSource.initialize()...');
    await AppDataSource.initialize();
    console.log('[Server] ✓ Database connected successfully');
    console.log('[Server] DataSource.isInitialized:', AppDataSource.isInitialized);

    try {
      await ensureTeacherGenderColumn(AppDataSource);
      await ensureTeacherMaritalStatusColumn(AppDataSource);
    } catch (tgErr: any) {
      console.warn('[Server] ensureTeacherGenderColumn:', tgErr?.message || tgErr);
    }

    try {
      await ensureSubjectShortTitleColumn(AppDataSource);
    } catch (stErr: any) {
      console.warn('[Server] ensureSubjectShortTitleColumn:', stErr?.message || stErr);
    }

    try {
      await ensureSubjectDepartmentIdColumn(AppDataSource);
    } catch (sdErr: any) {
      console.warn('[Server] ensureSubjectDepartmentIdColumn:', sdErr?.message || sdErr);
    }

    try {
      await ensureSchoolMottoColumns(AppDataSource);
    } catch (smErr: any) {
      console.warn('[Server] ensureSchoolMottoColumns:', smErr?.message || smErr);
    }

    try {
      await ensureMessageAttachmentUrlColumn(AppDataSource);
    } catch (maErr: any) {
      console.warn('[Server] ensureMessageAttachmentUrlColumn:', maErr?.message || maErr);
    }

    try {
      await ensureClassTimeOffGridColumn(AppDataSource);
    } catch (togErr: any) {
      console.warn('[Server] ensureClassTimeOffGridColumn:', togErr?.message || togErr);
    }

    try {
      await ensureTimetableSlotNoUniqueCollision(AppDataSource);
    } catch (ttErr: any) {
      console.warn('[Server] ensureTimetableSlotNoUniqueCollision:', ttErr?.message || ttErr);
    }

    try {
      await ensureFurnitureCurrentTeacherColumn(AppDataSource);
    } catch (furColErr: any) {
      console.warn('[Server] ensureFurnitureCurrentTeacherColumn:', furColErr?.message || furColErr);
    }

    try {
      await ensureInvoiceFeeLineItemsColumn(AppDataSource);
    } catch (invFlErr: any) {
      console.warn('[Server] ensureInvoiceFeeLineItemsColumn:', invFlErr?.message || invFlErr);
    }

    try {
      await ensureGradeBandsColumn(AppDataSource);
    } catch (gbErr: any) {
      console.warn('[Server] ensureGradeBandsColumn:', gbErr?.message || gbErr);
    }

    // Ensure existing students use the student ID prefix from settings (one-time alignment per boot)
    if (process.env.SKIP_STUDENT_ID_PREFIX_SYNC !== 'true') {
      try {
        const syncResult = await syncStoredStudentNumbersWithSettingsPrefix();
        if (syncResult.updated > 0) {
          console.log(
            `[Server] Student ID prefix sync: updated ${syncResult.updated}, skipped ${syncResult.skipped}`
          );
        }
        if (syncResult.errors.length > 0) {
          console.warn('[Server] Student ID prefix sync:', syncResult.errors.join('; '));
        }
      } catch (syncErr: any) {
        console.warn('[Server] Student ID prefix sync skipped/failed:', syncErr?.message || syncErr);
      }
    }

    if (process.env.SKIP_TEACHER_ID_PREFIX_SYNC !== 'true') {
      try {
        const syncResult = await syncStoredTeacherIdsWithSettingsPrefix();
        if (syncResult.updated > 0) {
          console.log(
            `[Server] Teacher ID prefix sync: updated ${syncResult.updated}, skipped ${syncResult.skipped}`
          );
        }
        if (syncResult.errors.length > 0) {
          console.warn('[Server] Teacher ID prefix sync:', syncResult.errors.join('; '));
        }
      } catch (syncErr: any) {
        console.warn('[Server] Teacher ID prefix sync skipped/failed:', syncErr?.message || syncErr);
      }
    }

    // ========== SKIP MIGRATIONS ON STARTUP ==========
    // Migrations should be run manually using: npm run typeorm -- migration:run
    // This prevents the server from hanging on startup if migrations are slow or blocked
    console.log('[Server] Skipping migrations (tables already created by sync-schema)...');
    console.log('[Server] Migrations skipped - proceeding to start server');

    console.log('[Server] DataSource options:', {
      type: AppDataSource.options.type,
      database: AppDataSource.options.database,
      entitiesCount: AppDataSource.entityMetadatas.length,
      migrationsCount: AppDataSource.migrations.length,
    });

    console.log('[Server] Starting HTTP server on port', PORT);
    app.listen(PORT, () => {
      console.log(`[Server] ✓ Server running on port ${PORT}`);
    });
  } catch (error: any) {
    console.error('[Server] ✗ ERROR connecting to database:');
    console.error('  Error type:', error?.constructor?.name);
    console.error('  Error name:', error?.name);
    console.error('  Message:', error?.message);
    console.error('  Code:', error?.code);
    console.error('  Stack:', error?.stack);

    const dbUrl = String(process.env.DATABASE_URL || '').trim();
    let urlHost = '';
    if (dbUrl) {
      try {
        urlHost = new URL(dbUrl.replace(/^postgresql:/i, 'postgres:')).hostname;
      } catch {
        /* ignore */
      }
    }
    const host = String(process.env.DB_HOST || urlHost || '').trim();
    if (error?.code === 'ENOTFOUND' && host && !host.includes('.')) {
      console.error(
        '[Server] Hint: database host looks like a short Render DB id (no domain). ' +
          'Use a full hostname in DATABASE_URL or DB_HOST ' +
          '(e.g. dpg-xxxxx.<region>-postgres.render.com), or link Postgres to the web service so Render sets DATABASE_URL.'
      );
    }

    process.exit(1);
  }
}

bootstrap();