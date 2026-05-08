import { DataSource } from 'typeorm';

/** Ensures inventory_furniture_items.currentTeacherId exists when migrations are skipped. */
export async function ensureFurnitureCurrentTeacherColumn(dataSource: DataSource): Promise<void> {
  try {
    await dataSource.query(`
      ALTER TABLE "inventory_furniture_items"
      ADD COLUMN IF NOT EXISTS "currentTeacherId" uuid
    `);

    await dataSource.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_inventory_furniture_items_currentTeacherId_teachers'
        ) THEN
          ALTER TABLE "inventory_furniture_items"
          ADD CONSTRAINT "FK_inventory_furniture_items_currentTeacherId_teachers"
          FOREIGN KEY ("currentTeacherId") REFERENCES "teachers"("id")
          ON DELETE SET NULL;
        END IF;
      END $$;
    `);
  } catch (e: any) {
    console.warn('[ensureFurnitureCurrentTeacherColumn]', e?.message || e);
  }
}
