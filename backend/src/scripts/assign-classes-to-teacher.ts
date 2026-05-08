/**
 * Script to assign classes to a teacher
 * Usage: npx ts-node src/scripts/assign-classes-to-teacher.ts <teacherId> [classIds...]
 * Example: npx ts-node src/scripts/assign-classes-to-teacher.ts jpst9397313
 * 
 * If no classIds provided, will assign all available classes
 */

import { AppDataSource } from '../config/database';
import { Teacher } from '../entities/Teacher';
import { Class } from '../entities/Class';
import { linkTeacherToClasses } from '../utils/teacherClassLinker';
import { In } from 'typeorm';

async function assignClassesToTeacher() {
  try {
    // Initialize database
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.log('✓ Database connected');
    }

    const teacherId = process.argv[2]; // TeacherID string (e.g., jpst9397313)
    
    if (!teacherId) {
      console.error('Usage: npx ts-node src/scripts/assign-classes-to-teacher.ts <teacherId> [classIds...]');
      console.error('Example: npx ts-node src/scripts/assign-classes-to-teacher.ts jpst9397313');
      process.exit(1);
    }

    const teacherRepository = AppDataSource.getRepository(Teacher);
    const classRepository = AppDataSource.getRepository(Class);

    // Find teacher by teacherId (string)
    const teacher = await teacherRepository.findOne({
      where: { teacherId: teacherId }
    });

    if (!teacher) {
      console.error(`❌ Teacher with TeacherID "${teacherId}" not found`);
      process.exit(1);
    }

    console.log(`✓ Found teacher: ${teacher.firstName} ${teacher.lastName} (${teacher.teacherId})`);
    console.log(`  Teacher UUID: ${teacher.id}`);

    // Get all classes
    const allClasses = await classRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' }
    });

    if (allClasses.length === 0) {
      console.error('❌ No active classes found in the database');
      process.exit(1);
    }

    console.log(`\n📚 Available classes (${allClasses.length}):`);
    allClasses.forEach((cls, index) => {
      console.log(`  ${index + 1}. ${cls.name} (${cls.form}) - ID: ${cls.id}`);
    });

    // Get classIds from command line arguments or use all classes
    let classIdsToAssign: string[] = [];
    
    if (process.argv.length > 3) {
      // Class IDs provided as arguments
      classIdsToAssign = process.argv.slice(3);
      console.log(`\n📝 Assigning specified classes: ${classIdsToAssign.join(', ')}`);
    } else {
      // Assign all classes
      classIdsToAssign = allClasses.map(c => c.id);
      console.log(`\n📝 Assigning ALL classes to teacher (${classIdsToAssign.length} classes)`);
    }

    // Validate class IDs
    const validClassIds = allClasses.map(c => c.id);
    const invalidIds = classIdsToAssign.filter(id => !validClassIds.includes(id));
    
    if (invalidIds.length > 0) {
      console.error(`❌ Invalid class IDs: ${invalidIds.join(', ')}`);
      process.exit(1);
    }

    // Update teacher with classes (ManyToMany)
    const classesToAssign = await classRepository.find({
      where: { id: In(classIdsToAssign) }
    });

    teacher.classes = classesToAssign;
    await teacherRepository.save(teacher);
    console.log(`✓ Updated teacher's ManyToMany relationship`);

    // Also link via junction table
    await linkTeacherToClasses(teacher.id, classIdsToAssign);
    console.log(`✓ Updated junction table`);

    console.log(`\n✅ Successfully assigned ${classesToAssign.length} class(es) to teacher:`);
    classesToAssign.forEach(cls => {
      console.log(`   - ${cls.name} (${cls.form})`);
    });

    // Verify
    const updatedTeacher = await teacherRepository.findOne({
      where: { id: teacher.id },
      relations: ['classes']
    });

    console.log(`\n✓ Verification: Teacher now has ${updatedTeacher?.classes.length || 0} class(es) assigned`);

    await AppDataSource.destroy();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

assignClassesToTeacher();

