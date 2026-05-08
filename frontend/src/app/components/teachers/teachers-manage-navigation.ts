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
    addNew: m ? '/teachers/manage/add-new' : '/teachers/new',
    assignClasses: m ? '/teachers/manage/assign-classes' : '/teachers/assign-classes',
    allocateClass: m ? '/teachers/manage/allocate_class' : '/teachers/allocate_class',
    recordBook: m ? '/teachers/manage/record-book' : '/admin/teacher-record-book',
    teacherSubjectAssignment: '/teachers/manage/teacher_subject',
    teacherSubjectContact: (id: string) => `/teachers/manage/teacher_subject/contact/${id}`,
    editSegments: (id: string) =>
      m ? ['/teachers', 'manage', 'edit', id] : ['/teachers', id, 'edit'],
  };
}
