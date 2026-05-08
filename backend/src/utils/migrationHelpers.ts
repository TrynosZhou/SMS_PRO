import { QueryRunner, TableForeignKey, TableIndex, TableUnique } from 'typeorm';

/** True when PostgreSQL reports duplicate constraint / relation / index. */
export function isPgDuplicateObjectError(e: unknown): boolean {
  const err = e as { code?: string; driverError?: { code?: string; message?: string }; message?: string };
  const code = err?.code ?? err?.driverError?.code;
  if (code === '42710' || code === '42P07' || code === '42701') return true;
  const msg = String(err?.message ?? err?.driverError?.message ?? '').toLowerCase();
  return msg.includes('already exists');
}

export async function safeCreateForeignKey(
  queryRunner: QueryRunner,
  tableName: string,
  foreignKey: TableForeignKey
): Promise<void> {
  try {
    await queryRunner.createForeignKey(tableName, foreignKey);
  } catch (e: unknown) {
    if (!isPgDuplicateObjectError(e)) throw e;
  }
}

export async function safeCreateIndex(
  queryRunner: QueryRunner,
  tableName: string,
  index: TableIndex
): Promise<void> {
  try {
    await queryRunner.createIndex(tableName, index);
  } catch (e: unknown) {
    if (!isPgDuplicateObjectError(e)) throw e;
  }
}

export async function safeCreateUniqueConstraint(
  queryRunner: QueryRunner,
  tableName: string,
  uniqueConstraint: TableUnique
): Promise<void> {
  try {
    await queryRunner.createUniqueConstraint(tableName, uniqueConstraint);
  } catch (e: unknown) {
    if (!isPgDuplicateObjectError(e)) throw e;
  }
}
