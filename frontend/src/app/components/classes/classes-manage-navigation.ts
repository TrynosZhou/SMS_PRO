import { Router } from '@angular/router';

/** True when inside the Class Manager tabbed shell (`/classes/manage/...`). */
export function isInClassesManageShell(router: Router): boolean {
  return router.url.split('?')[0].includes('/classes/manage');
}

export function classesManageNav(router: Router) {
  const m = isInClassesManageShell(router);
  return {
    list: m ? '/classes/manage/classes' : '/classes',
    lists: m ? '/classes/manage/lists' : '/classes/lists',
    markRegister: m ? '/classes/manage/mark-register' : '/attendance/mark',
    attendanceReports: m ? '/reports/manage/attendance-reports' : '/attendance/reports',
    addNew: m ? '/classes/manage/add-new' : '/classes/new',
    editSegments: (id: string) =>
      m ? ['/classes', 'manage', 'edit', id] : ['/classes', id, 'edit'],
  };
}

/** Navigate to the class list (Manage Classes), preserving manage shell when active. */
export function navigateToClassesList(
  router: Router,
  queryParams?: Record<string, string | undefined>
): void {
  if (isInClassesManageShell(router)) {
    router.navigate(['/classes', 'manage', 'classes'], { queryParams });
  } else {
    router.navigate(['/classes'], { queryParams });
  }
}
