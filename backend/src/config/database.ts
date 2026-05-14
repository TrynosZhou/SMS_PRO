import { DataSource } from 'typeorm';
import dotenv from 'dotenv';
import { User } from '../entities/User';
import { Student } from '../entities/Student';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Exam } from '../entities/Exam';
import { Marks } from '../entities/Marks';
import { Invoice } from '../entities/Invoice';
import { Parent } from '../entities/Parent';
import { Settings } from '../entities/Settings';
import { ReportCardRemarks } from '../entities/ReportCardRemarks';
import { Message } from '../entities/Message';
import { UniformItem } from '../entities/UniformItem';
import { InvoiceUniformItem } from '../entities/InvoiceUniformItem';
import { Attendance } from '../entities/Attendance';
import { PromotionRule } from '../entities/PromotionRule';
import { RecordBook } from '../entities/RecordBook';
import { StudentTransfer } from '../entities/StudentTransfer';
import { StudentEnrollment } from '../entities/StudentEnrollment';
import { StudentFeeExemption } from '../entities/StudentFeeExemption';
import { TimetableConfig } from '../entities/TimetableConfig';
import { TimetableSlot } from '../entities/TimetableSlot';
import { TimetableVersion } from '../entities/TimetableVersion';
import { InventorySettings } from '../entities/InventorySettings';
import { TextbookCatalog } from '../entities/TextbookCatalog';
import { TextbookCopy } from '../entities/TextbookCopy';
import { FurnitureItem } from '../entities/FurnitureItem';
import { TextbookPermanentIssue } from '../entities/TextbookPermanentIssue';
import { LibraryLoan } from '../entities/LibraryLoan';
import { FurnitureAssignment } from '../entities/FurnitureAssignment';
import { InventoryFine } from '../entities/InventoryFine';
import { InventoryAuditLog } from '../entities/InventoryAuditLog';
import { TextbookTransfer } from '../entities/TextbookTransfer';
import { Department } from '../entities/Department';

// Load environment variables (only if not already set, e.g., in production)
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

console.log('[DB Config] Creating DataSource configuration...');
console.log('[DB Config] Node version:', process.version);
console.log('[DB Config] NODE_ENV:', process.env.NODE_ENV);
console.log('[DB Config] Module type check - typeof exports:', typeof exports);
console.log('[DB Config] Module type check - typeof module:', typeof module);

console.log('[DB Config] Preparing entity list...');
// Try using entity classes first, fallback to paths if needed
const entities = [
  User,
  Student,
  Teacher,
  Department,
  Class,
  Subject,
  Exam,
  Marks,
  Invoice,
  Parent,
  Settings,
  ReportCardRemarks,
  Message,
  UniformItem,
  InvoiceUniformItem,
  Attendance,
  PromotionRule,
  RecordBook,
  StudentTransfer,
  StudentEnrollment,
  StudentFeeExemption,
  TimetableConfig,
  TimetableSlot,
  TimetableVersion,
  InventorySettings,
  TextbookCatalog,
  TextbookCopy,
  FurnitureItem,
  TextbookPermanentIssue,
  LibraryLoan,
  FurnitureAssignment,
  InventoryFine,
  InventoryAuditLog,
  TextbookTransfer,
];
console.log('[DB Config] Entity count:', entities.length);
console.log('[DB Config] Entity names:', entities.map(e => e?.name || 'unknown').join(', '));
console.log('[DB Config] Checking each entity...');
entities.forEach((entity, index) => {
  try {
    console.log(`[DB Config] Entity ${index + 1}: ${entity?.name || 'unknown'} - OK`);
  } catch (err: any) {
    console.error(`[DB Config] Entity ${index + 1}: ERROR -`, err?.message);
  }
});

/**
 * Hosted Postgres (Render, etc.) usually requires TLS; local postgres usually does not.
 * `connectionHint` can be DATABASE_URL or a hostname (DB_HOST).
 */
function getPostgresSsl(connectionHint?: string): false | { rejectUnauthorized: boolean } {
  const hint = (connectionHint || process.env.DB_HOST || '').trim().toLowerCase();
  const flag = (process.env.DB_SSL || '').trim().toLowerCase();
  if (flag === 'false' || flag === '0') {
    return false;
  }
  const useSsl =
    flag === 'true' ||
    flag === '1' ||
    hint.includes('render.com') ||
    hint.includes('amazonaws.com') ||
    hint.includes('neon.tech') ||
    hint.includes('supabase.co');
  if (!useSsl) {
    return false;
  }
  return { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
}

function logDatabaseUrlTarget(databaseUrl: string): void {
  try {
    const normalized = databaseUrl.replace(/^postgresql:/i, 'postgres:');
    const u = new URL(normalized);
    console.log('[DB Config] DATABASE_URL host:', u.hostname, 'database:', u.pathname?.replace(/^\//, '') || '(default)');
  } catch {
    console.log('[DB Config] DATABASE_URL is set (could not parse for logging)');
  }
}

console.log('[DB Config] Creating DataSource instance...');
let AppDataSource: DataSource;
try {
  const entityPaths = process.env.NODE_ENV === 'production'
    ? ['dist/entities/**/*.js']
    : ['src/entities/**/*.ts'];
  const migrationsPath = process.env.NODE_ENV === 'production' 
    ? ['dist/migrations/**/*.js'] 
    : ['src/migrations/**/*.ts'];
  const subscribersPath = process.env.NODE_ENV === 'production'
    ? ['dist/subscribers/**/*.js']
    : ['src/subscribers/**/*.ts'];
  
  console.log('[DB Config] Using entity paths:', entityPaths);
  console.log('[DB Config] Migrations path:', migrationsPath);
  console.log('[DB Config] Subscribers path:', subscribersPath);
  
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const dbHost = process.env.DB_HOST?.trim();
  const dbPort = process.env.DB_PORT ? parseInt(process.env.DB_PORT.trim(), 10) : undefined;
  const dbUser = process.env.DB_USERNAME?.trim();
  const dbPassword = process.env.DB_PASSWORD !== undefined ? String(process.env.DB_PASSWORD).trim() : '';
  const dbName = process.env.DB_NAME?.trim();

  const ssl = getPostgresSsl(databaseUrl || dbHost);
  console.log('[DB Config] Postgres SSL:', ssl ? 'enabled' : 'disabled');

  const baseOptions = {
    type: 'postgres' as const,
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: false,
    entities: entityPaths,
    migrations: migrationsPath,
    subscribers: subscribersPath,
    ssl,
    /**
     * `none`: each statement auto-commits so idempotent migrations can ignore duplicate FK/index errors
     * without aborting the whole migration (common when DB was partially created via synchronize).
     */
    migrationsTransactionMode: 'none' as const,
  };

  if (databaseUrl) {
    logDatabaseUrlTarget(databaseUrl);
    console.log('[DB Config] Postgres connection: DATABASE_URL');
    AppDataSource = new DataSource({
      ...baseOptions,
      url: databaseUrl,
    });
  } else {
    console.log('[DB Config] Postgres connection: DB_HOST / DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME');
    AppDataSource = new DataSource({
      ...baseOptions,
      host: dbHost || 'localhost',
      port: dbPort ?? parseInt('5432', 10),
      username: dbUser || 'postgres',
      password: dbPassword,
      database: dbName || 'sms_db',
    });
  }
  
  console.log('[DB Config] DataSource created successfully');
  console.log('[DB Config] DataSource.isInitialized:', AppDataSource.isInitialized);
} catch (error: any) {
  console.error('[DB Config] ✗ ERROR creating DataSource:');
  console.error('[DB Config] Error type:', error?.constructor?.name);
  console.error('[DB Config] Error message:', error?.message);
  console.error('[DB Config] Error code:', error?.code);
  console.error('[DB Config] Error stack:', error?.stack);
  if (error?.cause) {
    console.error('[DB Config] Error cause:', error.cause);
  }
  throw error;
}

export { AppDataSource };

