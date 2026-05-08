DROP TABLE IF EXISTS report_releases;

CREATE TABLE report_releases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term                VARCHAR(100) NOT NULL,
  year                INTEGER NOT NULL,
  "examType"          VARCHAR(50)  NOT NULL DEFAULT 'end_term',
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
  "releasedDate"      DATE,
  "scheduledRelease"  TIMESTAMP,
  "releasedBy"        VARCHAR(150),
  "createdAt"         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
