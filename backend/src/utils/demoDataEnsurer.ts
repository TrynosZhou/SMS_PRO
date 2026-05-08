import { AppDataSource } from '../config/database';
import { Class } from '../entities/Class';
import { Subject } from '../entities/Subject';
import { Teacher } from '../entities/Teacher';
import { resetDemoDataForLogin } from './resetDemoData';

/**
 * Ensure demo data (classes, subjects, teachers) exists.
 * If any of these collections are empty, reset and seed demo data.
 */
export async function ensureDemoDataAvailable(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const classRepository = AppDataSource.getRepository(Class);
  const subjectRepository = AppDataSource.getRepository(Subject);
  const teacherRepository = AppDataSource.getRepository(Teacher);

  const [classCount, subjectCount, teacherCount] = await Promise.all([
    classRepository.count(),
    subjectRepository.count(),
    teacherRepository.count()
  ]);

  if (classCount === 0 || subjectCount === 0 || teacherCount === 0) {
    console.log('[DemoData] Missing demo dataset (classes:', classCount, ', subjects:', subjectCount, ', teachers:', teacherCount, '). Resetting demo data...');
    await resetDemoDataForLogin();
    console.log('[DemoData] Demo dataset reset completed.');
  }
}

