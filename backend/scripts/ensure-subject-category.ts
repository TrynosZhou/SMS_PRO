import 'reflect-metadata';
import { AppDataSource } from '../src/config/database';
import { Subject, SubjectCategory } from '../src/entities/Subject';

interface SubjectSeed {
  name: string;
  code: string;
  category: SubjectCategory;
  description?: string | null;
}

async function ensureSubjectSeeds() {
  const seeds: SubjectSeed[] = [
    {
        name: 'Computer Science',
        code: '0478',
        category: 'O_LEVEL',
        description: 'O Level Computer Science'
    },
    {
        name: 'Computer Science',
        code: '9618',
        category: 'A_LEVEL',
        description: 'A Level Computer Science'
    }
  ];

  const subjectRepository = AppDataSource.getRepository(Subject);

  for (const seed of seeds) {
    const existing = await subjectRepository.findOne({
      where: { code: seed.code }
    });

    if (existing) {
      let shouldSave = false;
      if (existing.category !== seed.category) {
        existing.category = seed.category;
        shouldSave = true;
      }
      if (!existing.description && seed.description) {
        existing.description = seed.description;
        shouldSave = true;
      }
      if (shouldSave) {
        await subjectRepository.save(existing);
        console.log(`Normalized subject ${seed.code}: category=${seed.category}`);
      }
      continue;
    }

    const newSubject = subjectRepository.create({
      name: seed.name,
      code: seed.code,
      category: seed.category,
      description: seed.description || null,
      isActive: true
    });

    await subjectRepository.save(newSubject);
    console.log(`Created subject ${seed.name} (${seed.code}) [${seed.category}]`);
  }
}

async function ensureSubjectCategoryColumn() {
  const queryRunner = AppDataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    const hasColumn = await queryRunner.hasColumn('subjects', 'category');
    if (!hasColumn) {
      console.log('Adding "category" column to "subjects" table...');
      await queryRunner.query(
        `ALTER TABLE "subjects" ADD COLUMN "category" character varying NOT NULL DEFAULT 'O_LEVEL'`
      );
      console.log('Column "category" added successfully.');
    } else {
      console.log('Column "category" already exists on "subjects" table.');
    }
  } finally {
    await queryRunner.release();
  }
}

async function run() {
  try {
    await AppDataSource.initialize();
    console.log('[ensure-subject-category] DataSource initialized');

    await ensureSubjectCategoryColumn();
    await ensureSubjectSeeds();

    console.log('[ensure-subject-category] Completed successfully');
  } catch (error) {
    console.error('[ensure-subject-category] Error:', error);
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

run();



