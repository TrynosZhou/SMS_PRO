import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUserActivityLogTable1769800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasTable('user_activity_logs');
    if (!has) {
      await queryRunner.createTable(
        new Table({
          name: 'user_activity_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false
          },
          {
            name: 'username',
            type: 'varchar',
            isNullable: false
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['admin', 'accountant', 'superadmin'],
            isNullable: false
          },
          {
            name: 'loginAt',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'logoutAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'menusAccessed',
            type: 'text',
            isNullable: true
          },
          {
            name: 'lastMenuAccessed',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            isNullable: false,
            default: 'CURRENT_TIMESTAMP'
          }
        ]
      }),
      true
    );
    }

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_USER_ACTIVITY_LOGS_USERID" ON "user_activity_logs" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_USER_ACTIVITY_LOGS_LOGINAT" ON "user_activity_logs" ("loginAt")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_activity_logs');
  }
}

