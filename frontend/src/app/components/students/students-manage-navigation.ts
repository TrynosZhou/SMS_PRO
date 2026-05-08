import { Router } from '@angular/router';

/** True when the user is inside the Student Manager tabbed shell (`/students/manage/...`). */
export function isInStudentsManageShell(router: Router): boolean {
  return router.url.split('?')[0].includes('/students/manage');
}

/** Routes that mirror standalone student URLs when embedded in the manage shell. */
export function studentsManageNav(router: Router) {
  const m = isInStudentsManageShell(router);
  return {
    list: m ? '/students/manage/students' : '/students',
    addNew: m ? '/students/manage/add-new' : '/students/new',
    enroll: m ? '/students/manage/enroll' : '/enrollments/new',
    unenrolled: m ? '/students/manage/unenrolled' : '/enrollments/unenrolled',
    editSegments: (id: string) =>
      m ? ['/students', 'manage', 'edit', id] : ['/students', id, 'edit'],
  };
}
