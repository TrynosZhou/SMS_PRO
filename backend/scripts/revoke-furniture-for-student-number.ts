/**
 * Revokes the active furniture assignment for a student by studentNumber (e.g. VIC5762026).
 * Releases desk/chair back to class-teacher pool or central stock (same rules as API revoke).
 * Writes inventory_audit_logs: action furniture_revoke, entityType furniture_assignment
 * (performedByUserId null; payload marks cli_script).
 *
 * Usage: npx ts-node scripts/revoke-furniture-for-student-number.ts <studentNumber>
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { IsNull } from 'typeorm';
import { AppDataSource } from '../src/config/database';
import { Student } from '../src/entities/Student';
import { Teacher } from '../src/entities/Teacher';
import { EntityManager } from 'typeorm';
import { FurnitureAssignment } from '../src/entities/FurnitureAssignment';
import { FurnitureItem } from '../src/entities/FurnitureItem';
import { InventoryAuditLog } from '../src/entities/InventoryAuditLog';

dotenv.config();

const FURN_IN_STOCK = 'in_stock';
const FURN_WITH_TEACHER = 'with_teacher';

async function releaseItemsAfterRevoke(em: EntityManager, row: FurnitureAssignment): Promise<void> {
  const poolTeacherId = row.authorizedByUserId
    ? (await em.getRepository(Teacher).findOne({ where: { userId: row.authorizedByUserId } as any }))?.id ?? null
    : null;
  const release = async (item: FurnitureItem | null) => {
    if (!item) return;
    item.currentStudentId = null;
    if (poolTeacherId) {
      item.status = FURN_WITH_TEACHER;
      item.currentTeacherId = poolTeacherId;
    } else {
      item.status = FURN_IN_STOCK;
      item.currentTeacherId = null;
    }
    await em.getRepository(FurnitureItem).save(item);
  };
  await release(row.deskItem ?? null);
  await release(row.chairItem ?? null);
}

async function main() {
  const studentNumber = String(process.argv[2] || '').trim();
  if (!studentNumber) {
    console.error('Usage: npx ts-node scripts/revoke-furniture-for-student-number.ts <studentNumber>');
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const result = await AppDataSource.transaction(async em => {
      const student = await em.getRepository(Student).findOne({
        where: { studentNumber } as any,
      });
      if (!student) {
        return { kind: 'no_student' as const };
      }

      const row = await em.getRepository(FurnitureAssignment).findOne({
        where: { studentId: student.id, revokedAt: IsNull() } as any,
        relations: ['deskItem', 'chairItem'],
        order: { issuedAt: 'DESC' } as any,
      });

      if (!row) {
        return { kind: 'no_assignment' as const, student };
      }

      row.revokedAt = new Date();
      await em.getRepository(FurnitureAssignment).save(row);
      await releaseItemsAfterRevoke(em, row);

      const auditRow = em.getRepository(InventoryAuditLog).create({
        action: 'furniture_revoke',
        entityType: 'furniture_assignment',
        entityId: row.id,
        studentId: row.studentId,
        performedByUserId: null,
        payload: {
          source: 'cli_script',
          script: 'revoke-furniture-for-student-number.ts',
          studentNumber,
        },
      });
      await em.getRepository(InventoryAuditLog).save(auditRow);

      return {
        kind: 'revoked' as const,
        row,
        student,
        auditId: auditRow.id,
      };
    });

    if (result.kind === 'no_student') {
      console.error(`No student with studentNumber "${studentNumber}"`);
      process.exit(1);
    }
    if (result.kind === 'no_assignment') {
      console.log(
        `No active furniture assignment for ${studentNumber} (${result.student.firstName} ${result.student.lastName}).`
      );
      return;
    }

    console.log(
      `Revoked assignment ${result.row.id} for ${studentNumber}: desk=${result.row.deskItem?.itemCode || '—'} chair=${result.row.chairItem?.itemCode || '—'} (audit ${result.auditId})`
    );
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
