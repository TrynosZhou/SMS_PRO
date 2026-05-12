import { Router } from '@angular/router';

/** True when inside the Teacher Manager tabbed shell (`/teachers/manage/...`). */
export function isInTeachersManageShell(router: Router): boolean {
  return router.url.split('?')[0].includes('/teachers/manage');
}

/** Routes mirroring standalone teacher URLs when embedded in the manage shell. */
export function teachersManageNav(router: Router) {
  const m = isInTeachersManageShell(router);
  return {
    list: m ? '/teachers/manage/teachers' : '/teachers',
    /** @deprecated Add Teacher is now an in-app modal; call AddTeacherModalService.open() instead. */
    addNew: m ? '/teachers/manage/teachers' : '/teachers',
    assignClasses: '/assign-classes',
    allocateClass: '/allocate_class',
    recordBook: m ? '/teachers/manage/record-book' : '/admin/teacher-record-book',
    teacherSubjectAssignment: '/teacher_subject',
    teacherSubjectContact: (id: string) => `/teachers/manage/teacher_subject/contact/${id}`,
    editSegments: (id: string) =>
      m ? ['/teachers', 'manage', 'edit', id] : ['/teachers', id, 'edit'],
  };
}
