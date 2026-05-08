-- ── Permissions table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL DEFAULT '',
  module      VARCHAR(60)  NOT NULL,
  action      VARCHAR(60)  NOT NULL,
  "isActive"  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── Roles table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(100) NOT NULL UNIQUE,
  description     VARCHAR(255) NOT NULL DEFAULT '',
  "isSystem"      BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  "permissionIds" JSONB NOT NULL DEFAULT '[]',
  "createdAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Seed: permissions by module ───────────────────────────────────────────────
INSERT INTO permissions (name, description, module, action) VALUES
  ('students.view',          'View student records',             'students',    'view'),
  ('students.create',        'Add new students',                 'students',    'create'),
  ('students.edit',          'Edit student details',             'students',    'edit'),
  ('students.delete',        'Delete students',                  'students',    'delete'),
  ('students.export',        'Export student data',              'students',    'export'),
  ('students.enroll',        'Enroll / unenroll students',       'students',    'enroll'),

  ('teachers.view',          'View teacher records',             'teachers',    'view'),
  ('teachers.create',        'Add new teachers',                 'teachers',    'create'),
  ('teachers.edit',          'Edit teacher details',             'teachers',    'edit'),
  ('teachers.delete',        'Delete teachers',                  'teachers',    'delete'),

  ('classes.view',           'View class records',               'classes',     'view'),
  ('classes.create',         'Create classes',                   'classes',     'create'),
  ('classes.edit',           'Edit class details',               'classes',     'edit'),
  ('classes.delete',         'Delete classes',                   'classes',     'delete'),
  ('classes.assign',         'Assign teachers to classes',       'classes',     'assign'),

  ('subjects.view',          'View subjects',                    'subjects',    'view'),
  ('subjects.create',        'Create subjects',                  'subjects',    'create'),
  ('subjects.edit',          'Edit subjects',                    'subjects',    'edit'),
  ('subjects.delete',        'Delete subjects',                  'subjects',    'delete'),

  ('exams.view',             'View exams and marks',             'exams',       'view'),
  ('exams.create',           'Create exams',                     'exams',       'create'),
  ('exams.edit',             'Edit exam details',                'exams',       'edit'),
  ('exams.delete',           'Delete exams',                     'exams',       'delete'),
  ('exams.publish',          'Publish exam results',             'exams',       'publish'),
  ('exams.marks_entry',      'Enter marks',                      'exams',       'marks_entry'),

  ('finance.view',           'View financial records',           'finance',     'view'),
  ('finance.create',         'Create invoices/payments',         'finance',     'create'),
  ('finance.edit',           'Edit financial records',           'finance',     'edit'),
  ('finance.delete',         'Delete financial records',         'finance',     'delete'),
  ('finance.export',         'Export financial reports',         'finance',     'export'),
  ('finance.audit',          'View payment audit log',           'finance',     'audit'),

  ('reports.view',           'View reports and report cards',    'reports',     'view'),
  ('reports.export',         'Export / print reports',           'reports',     'export'),
  ('reports.release',        'Release reports to parents',       'reports',     'release'),

  ('attendance.view',        'View attendance records',          'attendance',  'view'),
  ('attendance.mark',        'Mark attendance',                  'attendance',  'mark'),
  ('attendance.edit',        'Edit attendance records',          'attendance',  'edit'),
  ('attendance.export',      'Export attendance data',           'attendance',  'export'),

  ('messages.view',          'View messages',                    'messages',    'view'),
  ('messages.send',          'Send messages',                    'messages',    'send'),

  ('settings.view',          'View system settings',             'settings',    'view'),
  ('settings.edit',          'Edit system settings',             'settings',    'edit'),
  ('settings.academic',      'Manage academic settings',         'settings',    'academic'),

  ('users.view',             'View user accounts',               'users',       'view'),
  ('users.create',           'Create user accounts',             'users',       'create'),
  ('users.edit',             'Edit user accounts',               'users',       'edit'),
  ('users.delete',           'Delete user accounts',             'users',       'delete'),

  ('inventory.view',         'View inventory',                   'inventory',   'view'),
  ('inventory.manage',       'Manage inventory items',           'inventory',   'manage')
ON CONFLICT (name) DO NOTHING;

-- ── Seed: system roles ────────────────────────────────────────────────────────
-- We need the permission IDs, so we use a DO block
DO $$
DECLARE
  all_ids      JSONB;
  finance_ids  JSONB;
  dept_ids     JSONB;
  report_ids   JSONB;
  reception_ids JSONB;
  parent_ids   JSONB;
  hod_ids      JSONB;
BEGIN
  -- All 48 permissions (admin / dev get everything)
  SELECT jsonb_agg(id) INTO all_ids FROM permissions;

  -- Auditor: finance.view, finance.export, finance.audit, reports.view, reports.export, attendance.view
  SELECT jsonb_agg(id) INTO finance_ids FROM permissions
    WHERE name IN ('finance.view','finance.export','finance.audit','reports.view','reports.export','attendance.view');

  -- deputy / head: most things except delete & settings.edit
  SELECT jsonb_agg(id) INTO dept_ids FROM permissions
    WHERE name NOT IN ('students.delete','teachers.delete','classes.delete','subjects.delete',
                       'exams.delete','finance.delete','users.delete','settings.edit');

  -- director: dept_ids + settings.view
  SELECT jsonb_agg(id) INTO report_ids FROM permissions
    WHERE name NOT IN ('students.delete','teachers.delete','classes.delete','subjects.delete',
                       'exams.delete','finance.delete','users.delete');

  -- reception: students view/create/edit/enroll, classes.view, attendance.mark/view, messages.view/send, reports.view, inventory.view
  SELECT jsonb_agg(id) INTO reception_ids FROM permissions
    WHERE name IN ('students.view','students.create','students.edit','students.enroll',
                   'classes.view','attendance.view','attendance.mark',
                   'messages.view','messages.send','reports.view','inventory.view',
                   'finance.view','finance.create');

  -- parent: no permissions by default
  parent_ids := '[]'::jsonb;

  -- hod: subjects, classes, exams, attendance, reports (no finance, no users, no settings)
  SELECT jsonb_agg(id) INTO hod_ids FROM permissions
    WHERE module IN ('subjects','classes','exams','attendance','reports')
       OR name IN ('students.view','teachers.view','messages.view','messages.send');

  INSERT INTO roles (name, description, "isSystem", "isActive", "permissionIds") VALUES
    ('admin',     'System administrator with full access to all features',             TRUE, TRUE, COALESCE(all_ids,'[]'::jsonb)),
    ('dev',       'Developer with full access to all parts of the system',             TRUE, TRUE, COALESCE(all_ids,'[]'::jsonb)),
    ('director',  'School director with comprehensive oversight',                      TRUE, TRUE, COALESCE(report_ids,'[]'::jsonb)),
    ('head',      'Head of school with full academic and administrative oversight',    TRUE, TRUE, COALESCE(dept_ids,'[]'::jsonb)),
    ('deputy',    'Deputy head with cross-department oversight and approvals',         TRUE, TRUE, COALESCE(dept_ids,'[]'::jsonb)),
    ('hod',       'Head of Department with departmental management access',            TRUE, TRUE, COALESCE(hod_ids,'[]'::jsonb)),
    ('auditor',   'Auditor with read-only access to financial records',               TRUE, TRUE, COALESCE(finance_ids,'[]'::jsonb)),
    ('reception', 'Reception staff with registration and enrollment access',          TRUE, TRUE, COALESCE(reception_ids,'[]'::jsonb)),
    ('parent',    'Parent with access to child''s records and reports',               TRUE, TRUE, parent_ids)
  ON CONFLICT (name) DO NOTHING;
END $$;
