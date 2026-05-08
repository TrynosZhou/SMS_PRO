import { AppDataSource } from '../config/database';
import { In } from 'typeorm';
import { TeacherClass } from '../entities/TeacherClass';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';

/**
 * Keep TypeORM ManyToMany (`teachers_classes_classes`) identical to the junction rows we just wrote.
 * The UI and some flows merge both sources; timetable generation used to read only M2M and missed `teacher_classes`-only links.
 */
async function syncTeacherManyToManyClasses(teacherId: string, classIds: string[]): Promise<void> {
  try {
    const teacherRepository = AppDataSource.getRepository(Teacher);
    const classRepository = AppDataSource.getRepository(Class);
    const teacher = await teacherRepository.findOne({ where: { id: teacherId } });
    if (!teacher) {
      return;
    }
    teacher.classes =
      classIds.length > 0 ? await classRepository.find({ where: { id: In(classIds) } }) : [];
    await teacherRepository.save(teacher);
  } catch (e: any) {
    console.warn('[TeacherClassLinker] Could not sync Teacher.classes M2M after junction update:', e?.message || e);
  }
}

/**
 * Merge classes from `teacher_classes` into each teacher's `classes` array (in-memory).
 * Use before timetable generation so assignments match the teacher subject contact page.
 */
export async function mergeJunctionClassesIntoTeachers(teachers: Teacher[]): Promise<void> {
  if (!teachers.length) {
    return;
  }
  try {
    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
    await teacherClassRepository.count();
  } catch {
    return;
  }

  const teacherIds = teachers.map((t) => t.id);
  const repo = AppDataSource.getRepository(TeacherClass);
  const links = await repo
    .createQueryBuilder('tc')
    .innerJoinAndSelect('tc.class', 'class')
    .where('tc.teacherId IN (:...ids)', { ids: teacherIds })
    .getMany();

  const extrasByTeacher = new Map<string, Class[]>();
  for (const link of links) {
    if (!link.class) {
      continue;
    }
    const arr = extrasByTeacher.get(link.teacherId) ?? [];
    arr.push(link.class);
    extrasByTeacher.set(link.teacherId, arr);
  }

  for (const teacher of teachers) {
    const extras = extrasByTeacher.get(teacher.id) ?? [];
    if (!extras.length) {
      continue;
    }
    const byId = new Map<string, Class>();
    for (const c of teacher.classes ?? []) {
      if (c?.id) {
        byId.set(c.id, c);
      }
    }
    for (const c of extras) {
      if (c?.id && !byId.has(c.id)) {
        byId.set(c.id, c);
      }
    }
    teacher.classes = Array.from(byId.values());
  }
}

/**
 * Link a teacher to multiple classes using the junction table
 * If classIds is empty array, removes all links for the teacher
 */
export async function linkTeacherToClasses(teacherId: string, classIds: string[]): Promise<void> {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

    // Check if table exists by trying a simple query
    try {
      await teacherClassRepository.count();
    } catch (tableError: any) {
      // Table doesn't exist - log warning and return
      console.warn('[TeacherClassLinker] teacher_classes table does not exist. Please run migration first.');
      console.warn('[TeacherClassLinker] Skipping junction table linking. Using ManyToMany relation instead.');
      return;
    }

    // Always remove existing links for this teacher first
    await teacherClassRepository.delete({ teacherId });

    // If no classIds provided, we're done (all links removed)
    if (!classIds || classIds.length === 0) {
      console.log(`[TeacherClassLinker] Removed all class links for teacher ${teacherId}`);
      await syncTeacherManyToManyClasses(teacherId, []);
      return;
    }

    // Create new links
    for (const classId of classIds) {
      try {
        const teacherClass = teacherClassRepository.create({
          teacherId,
          classId
        });
        await teacherClassRepository.save(teacherClass);
      } catch (error: any) {
        // Ignore duplicate key errors (shouldn't happen after delete, but just in case)
        if (error.code !== '23505') { // PostgreSQL unique violation
          console.error(`[TeacherClassLinker] Error linking teacher ${teacherId} to class ${classId}:`, error.message);
        }
      }
    }

    console.log(`[TeacherClassLinker] Linked teacher ${teacherId} to ${classIds.length} classes`);
    await syncTeacherManyToManyClasses(teacherId, classIds);
  } catch (error: any) {
    console.error('[TeacherClassLinker] Error in linkTeacherToClasses:', error.message);
    // Don't throw - allow the operation to continue without junction table
  }
}

/**
 * Link a class to multiple teachers using the junction table
 * If teacherIds is empty array, removes all links for the class
 */
export async function linkClassToTeachers(classId: string, teacherIds: string[]): Promise<void> {
  try {
    // Ensure database is initialized
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

    // Check if table exists by trying a simple query
    try {
      await teacherClassRepository.count();
    } catch (tableError: any) {
      // Table doesn't exist - try to create it
      console.warn('[TeacherClassLinker] teacher_classes table does not exist. Attempting to create...');
      try {
        // Try to synchronize the schema (create table if it doesn't exist)
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.query(`
          CREATE TABLE IF NOT EXISTS teacher_classes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            "teacherId" UUID NOT NULL,
            "classId" UUID NOT NULL,
            CONSTRAINT "FK_teacher_classes_teacher" FOREIGN KEY ("teacherId") REFERENCES teachers(id) ON DELETE CASCADE,
            CONSTRAINT "FK_teacher_classes_class" FOREIGN KEY ("classId") REFERENCES classes(id) ON DELETE CASCADE,
            CONSTRAINT "UQ_teacher_classes" UNIQUE ("teacherId", "classId")
          );
          CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_teacherId" ON teacher_classes("teacherId");
          CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_classId" ON teacher_classes("classId");
        `);
        await queryRunner.release();
        console.log('[TeacherClassLinker] ✓ teacher_classes table created successfully');
      } catch (createError: any) {
        console.error('[TeacherClassLinker] Failed to create teacher_classes table:', createError.message);
        console.warn('[TeacherClassLinker] Skipping junction table linking. Using ManyToMany relation instead.');
        return;
      }
    }

    // Always remove existing links for this class first
    await teacherClassRepository.delete({ classId });

    // If no teacherIds provided, we're done (all links removed)
    if (!teacherIds || teacherIds.length === 0) {
      console.log(`[TeacherClassLinker] Removed all teacher links for class ${classId}`);
      return;
    }

    // Create new links
    for (const teacherId of teacherIds) {
      try {
        const teacherClass = teacherClassRepository.create({
          teacherId,
          classId
        });
        await teacherClassRepository.save(teacherClass);
      } catch (error: any) {
        // Ignore duplicate key errors (shouldn't happen after delete, but just in case)
        if (error.code !== '23505') { // PostgreSQL unique violation
          console.error(`[TeacherClassLinker] Error linking class ${classId} to teacher ${teacherId}:`, error.message);
        }
      }
    }

    console.log(`[TeacherClassLinker] Linked class ${classId} to ${teacherIds.length} teachers`);
  } catch (error: any) {
    console.error('[TeacherClassLinker] Error in linkClassToTeachers:', error.message);
    // Don't throw - allow the operation to continue without junction table
  }
}

/**
 * Get all class IDs for a teacher from the junction table
 */
export async function getTeacherClassIds(teacherId: string): Promise<string[]> {
  const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
  const teacherClasses = await teacherClassRepository.find({
    where: { teacherId },
    select: ['classId']
  });
  return teacherClasses.map(tc => tc.classId);
}

/**
 * Get all teacher IDs for a class from the junction table
 */
export async function getClassTeacherIds(classId: string): Promise<string[]> {
  const teacherClassRepository = AppDataSource.getRepository(TeacherClass);
  const teacherClasses = await teacherClassRepository.find({
    where: { classId },
    select: ['teacherId']
  });
  return teacherClasses.map(tc => tc.teacherId);
}

/**
 * Sync existing ManyToMany relationships to the junction table
 * This is useful for migrating existing data
 * Also checks reverse relationships (classes that have teachers assigned)
 */
export async function syncManyToManyToJunctionTable(): Promise<void> {
  const { Teacher } = await import('../entities/Teacher');
  const { Class } = await import('../entities/Class');
  const teacherRepository = AppDataSource.getRepository(Teacher);
  const classRepository = AppDataSource.getRepository(Class);
  const teacherClassRepository = AppDataSource.getRepository(TeacherClass);

  console.log('[TeacherClassLinker] Starting sync of ManyToMany to junction table...');

  // Check if table exists
  try {
    await teacherClassRepository.count();
  } catch (tableError: any) {
    console.warn('[TeacherClassLinker] teacher_classes table does not exist. Creating...');
    try {
      const queryRunner = AppDataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS teacher_classes (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "teacherId" UUID NOT NULL,
          "classId" UUID NOT NULL,
          CONSTRAINT "FK_teacher_classes_teacher" FOREIGN KEY ("teacherId") REFERENCES teachers(id) ON DELETE CASCADE,
          CONSTRAINT "FK_teacher_classes_class" FOREIGN KEY ("classId") REFERENCES classes(id) ON DELETE CASCADE,
          CONSTRAINT "UQ_teacher_classes" UNIQUE ("teacherId", "classId")
        );
        CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_teacherId" ON teacher_classes("teacherId");
        CREATE INDEX IF NOT EXISTS "IDX_teacher_classes_classId" ON teacher_classes("classId");
      `);
      await queryRunner.release();
      console.log('[TeacherClassLinker] ✓ teacher_classes table created');
    } catch (createError: any) {
      console.error('[TeacherClassLinker] Failed to create table:', createError.message);
      return;
    }
  }

  let syncedCount = 0;

  // Method 1: Get all teachers with their classes (forward relationship)
  const teachers = await teacherRepository.find({
    relations: ['classes']
  });

  for (const teacher of teachers) {
    if (teacher.classes && teacher.classes.length > 0) {
      for (const classItem of teacher.classes) {
        // Check if link already exists
        const existing = await teacherClassRepository.findOne({
          where: { teacherId: teacher.id, classId: classItem.id }
        });

        if (!existing) {
          const teacherClass = teacherClassRepository.create({
            teacherId: teacher.id,
            classId: classItem.id
          });
          await teacherClassRepository.save(teacherClass);
          syncedCount++;
        }
      }
    }
  }

  // Method 2: Get all classes with their teachers (reverse relationship)
  // This catches cases where classes have teachers but teachers don't have classes loaded
  const classes = await classRepository.find({
    relations: ['teachers']
  });

  for (const classItem of classes) {
    if (classItem.teachers && classItem.teachers.length > 0) {
      for (const teacher of classItem.teachers) {
        // Check if link already exists
        const existing = await teacherClassRepository.findOne({
          where: { teacherId: teacher.id, classId: classItem.id }
        });

        if (!existing) {
          const teacherClass = teacherClassRepository.create({
            teacherId: teacher.id,
            classId: classItem.id
          });
          await teacherClassRepository.save(teacherClass);
          syncedCount++;
        }
      }
    }
  }

  console.log(`[TeacherClassLinker] Synced ${syncedCount} teacher-class relationships to junction table`);
}

