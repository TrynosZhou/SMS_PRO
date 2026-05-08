import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey, TableUnique } from 'typeorm';
import { safeCreateForeignKey, safeCreateIndex, safeCreateUniqueConstraint } from '../utils/migrationHelpers';

export class CreateTimetableTables1769000000000 implements MigrationInterface {
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create timetable_configs table
    await queryRunner.createTable(
      new Table({
        name: 'timetable_configs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'periodsPerDay',
            type: 'integer',
            default: 8
          },
          {
            name: 'schoolStartTime',
            type: 'varchar',
            default: "'08:00'"
          },
          {
            name: 'schoolEndTime',
            type: 'varchar',
            default: "'16:00'"
          },
          {
            name: 'periodDurationMinutes',
            type: 'integer',
            default: 40
          },
          {
            name: 'breakPeriods',
            type: 'json',
            isNullable: true
          },
          {
            name: 'lessonsPerWeek',
            type: 'json',
            isNullable: true
          },
          {
            name: 'daysOfWeek',
            type: 'json',
            isNullable: true
          },
          {
            name: 'additionalPreferences',
            type: 'json',
            isNullable: true
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    );

    // Create timetable_versions table
    await queryRunner.createTable(
      new Table({
        name: 'timetable_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'name',
            type: 'varchar',
            isNullable: false
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true
          },
          {
            name: 'configId',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'isActive',
            type: 'boolean',
            default: false
          },
          {
            name: 'isPublished',
            type: 'boolean',
            default: false
          },
          {
            name: 'createdBy',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    );

    // Create timetable_slots table
    await queryRunner.createTable(
      new Table({
        name: 'timetable_slots',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'uuid_generate_v4()'
          },
          {
            name: 'versionId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'teacherId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'classId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'subjectId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'dayOfWeek',
            type: 'varchar',
            isNullable: false
          },
          {
            name: 'periodNumber',
            type: 'integer',
            isNullable: false
          },
          {
            name: 'startTime',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'endTime',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'room',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'isBreak',
            type: 'boolean',
            default: false
          },
          {
            name: 'isManuallyEdited',
            type: 'boolean',
            default: false
          },
          {
            name: 'editedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'editedBy',
            type: 'uuid',
            isNullable: true
          }
        ]
      }),
      true
    );

    // Add foreign keys for timetable_slots
    await safeCreateForeignKey(
      queryRunner,
      'timetable_slots',
      new TableForeignKey({
        columnNames: ['versionId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'timetable_versions',
        onDelete: 'CASCADE'
      })
    );

    await safeCreateForeignKey(
      queryRunner,
      'timetable_slots',
      new TableForeignKey({
        columnNames: ['teacherId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'teachers',
        onDelete: 'CASCADE'
      })
    );

    await safeCreateForeignKey(
      queryRunner,
      'timetable_slots',
      new TableForeignKey({
        columnNames: ['classId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'classes',
        onDelete: 'CASCADE'
      })
    );

    await safeCreateForeignKey(
      queryRunner,
      'timetable_slots',
      new TableForeignKey({
        columnNames: ['subjectId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'subjects',
        onDelete: 'CASCADE'
      })
    );

    // Add indexes for timetable_slots
    await safeCreateIndex(
      queryRunner,
      'timetable_slots',
      new TableIndex({
        name: 'IDX_timetable_slots_version_day_period',
        columnNames: ['versionId', 'dayOfWeek', 'periodNumber']
      })
    );

    // Add unique constraint to prevent teacher conflicts (same teacher, same day, same period)
    await safeCreateUniqueConstraint(
      queryRunner,
      'timetable_slots',
      new TableUnique({
        name: 'UQ_timetable_slots_teacher_day_period',
        columnNames: ['versionId', 'teacherId', 'dayOfWeek', 'periodNumber']
      })
    );

    // Add unique constraint to prevent class conflicts (same class, same day, same period)
    await safeCreateUniqueConstraint(
      queryRunner,
      'timetable_slots',
      new TableUnique({
        name: 'UQ_timetable_slots_class_day_period',
        columnNames: ['versionId', 'classId', 'dayOfWeek', 'periodNumber']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    const timetableSlotsTable = await queryRunner.getTable('timetable_slots');
    if (timetableSlotsTable) {
      const foreignKeys = timetableSlotsTable.foreignKeys;
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey('timetable_slots', foreignKey);
      }
    }

    // Drop tables
    await queryRunner.dropTable('timetable_slots', true);
    await queryRunner.dropTable('timetable_versions', true);
    await queryRunner.dropTable('timetable_configs', true);
  }
}

