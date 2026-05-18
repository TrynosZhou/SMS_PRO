import { Router } from '@angular/router';

/** True when inside the Teacher Manager tabbed shell (`/teachers/manage/...`). */
export function isInTeachersManageShell(router: Router): boolean {
  return router.url.split('?')[0].includes('/teachers/manage');
}

/** Routes mirroring standalone teacher URLs when embedded in the manage shell. */
export function teachersManageNav(router: Router) {
  const m = isInTeachersManageShell(router);
  return {
    /** Teacher directory / uploads: single page at `/teachers` (Manage Teachers). */
    list: '/teachers',
    /** Full-page add teacher: `/teachers/add-new`. */
    addNew: '/teachers/add-new',
    assignClasses: '/assign-classes',
    allocateClass: '/assign-classes',
    recordBook: m ? '/teachers/manage/record-book' : '/admin/teacher-record-book',
    teacherSubjectAssignment: '/teacher_subject',
    teacherSubjectContact: (id: string) => `/teachers/manage/teacher_subject/contact/${id}`,
    editSegments: (id: string) =>
      m ? ['/teachers', 'manage', 'edit', id] : ['/teachers', id, 'edit'],
  };
}
