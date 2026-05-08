-- Fee Categories
CREATE TABLE IF NOT EXISTS fee_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR NOT NULL,
  description VARCHAR NOT NULL DEFAULT '',
  "sortOrder" INT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Fee Items
CREATE TABLE IF NOT EXISTS fee_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "categoryId"  UUID NOT NULL REFERENCES fee_categories(id) ON DELETE CASCADE,
  "subCategory" VARCHAR NOT NULL,
  "itemName"    VARCHAR NOT NULL,
  amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency      VARCHAR NOT NULL DEFAULT 'USD',
  "sortOrder"   INT NOT NULL DEFAULT 0,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial categories
INSERT INTO fee_categories (name, description, "sortOrder")
VALUES
  ('O Level Fees', 'Ordinary Level Student Fees', 1),
  ('A Level Fees', 'Advanced Level Student Fees', 2)
ON CONFLICT DO NOTHING;
