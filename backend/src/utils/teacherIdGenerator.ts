import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { Settings } from '../entities/Settings';

/** Sanitize settings prefix: alphanumeric only, uppercase, non-empty default JPST */
export function sanitizeTeacherIdPrefix(raw?: string | null): string {
  let prefix = (raw ?? '').trim();
  prefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!prefix) {
    prefix = 'JPST';
  }
  return prefix;
}

/**
 * Current teacher ID prefix from Settings (single row, latest createdAt).
 */
export async function getTeacherIdPrefixFromSettings(): Promise<string> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const settingsRepository = AppDataSource.getRepository(Settings);
  let raw: string | undefined;
  try {
    const settings = await settingsRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' }
    });
    if (settings?.teacherIdPrefix) {
      raw = settings.teacherIdPrefix.trim();
    }
  } catch (error) {
    console.warn('Could not load settings for teacher ID prefix, using default:', error);
  }
  return sanitizeTeacherIdPrefix(raw);
}

/**
 * Generates a unique 7-digit random teacher ID with prefix from settings
 * Format: {PREFIX}1234567, {PREFIX}9876543, etc. (random 7-digit numbers)
 * Default prefix: JPST (if not configured in settings)
 */
export async function generateTeacherId(): Promise<string> {
  // Ensure database is initialized
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const teacherRepository = AppDataSource.getRepository(Teacher);
  const prefix = await getTeacherIdPrefixFromSettings();
  
  // Generate random 7-digit number and check uniqueness
  let attempts = 0;
  let teacherId: string;
  let existing: Teacher | null;
  
  do {
    // Generate random 7-digit number (1000000 to 9999999)
    const randomNumber = Math.floor(Math.random() * 9000000) + 1000000;
    const formattedNumber = randomNumber.toString().padStart(7, '0');
    teacherId = `${prefix}${formattedNumber}`;
    
    // Check if this teacher ID already exists
    existing = await teacherRepository.findOne({ 
      where: { teacherId } 
    });
    
    attempts++;
    
    // Safety check to prevent infinite loop
    if (attempts > 100) {
      throw new Error('Unable to generate unique teacher ID after multiple attempts');
    }
  } while (existing);

  return teacherId;
}

