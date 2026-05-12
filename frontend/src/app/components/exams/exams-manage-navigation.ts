import { Router } from '@angular/router';

/** True when inside the Exam Manager tabbed shell (`/exams/manage/...`). */
export function isInExamsManageShell(router: Router): boolean {
  return router.url.split('?')[0].includes('/exams/manage');
}

export function examsManageNav(router: Router) {
  const m = isInExamsManageShell(router);
  return {
    marksCapturing: '/marks-input',
    markSheet: '/mark-sheets',
    markInputProgress: '/marks-progress',
    rankings: '/ranking',
    reportCards: '/reports',
    publishResults: m ? '/exams/manage/publish-results' : '/publish-results',
    newExam: m ? '/exams/manage/new' : '/exams/new',
    marksEntrySegments: (id: string) =>
      m ? ['/exams', 'manage', id, 'marks'] : ['/exams', id, 'marks'],
  };
}

/** Back to Marks Capturing (the redesigned Marks Input page). */
export function navigateToExamsList(router: Router): void {
  router.navigate(['/marks-input']);
}
