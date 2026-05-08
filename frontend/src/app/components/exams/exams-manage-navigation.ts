import { Router } from '@angular/router';

/** True when inside the Exam Manager tabbed shell (`/exams/manage/...`). */
export function isInExamsManageShell(router: Router): boolean {
  return router.url.split('?')[0].includes('/exams/manage');
}

export function examsManageNav(router: Router) {
  const m = isInExamsManageShell(router);
  return {
    marksCapturing: m ? '/exams/manage/marks-capturing' : '/exams',
    markSheet: m ? '/exams/manage/mark-sheet' : '/mark-sheet',
    markInputProgress: m ? '/exams/manage/mark-input-progress' : '/exams/mark-input-progress',
    rankings: m ? '/exams/manage/rankings' : '/rankings',
    reportCards: m ? '/exams/manage/report-cards' : '/report-cards',
    publishResults: m ? '/exams/manage/publish-results' : '/publish-results',
    newExam: m ? '/exams/manage/new' : '/exams/new',
    marksEntrySegments: (id: string) =>
      m ? ['/exams', 'manage', id, 'marks'] : ['/exams', id, 'marks'],
  };
}

/** Back to Marks Capturing (exam list) — respects manage shell. */
export function navigateToExamsList(router: Router): void {
  if (isInExamsManageShell(router)) {
    router.navigate(['/exams', 'manage', 'marks-capturing']);
  } else {
    router.navigate(['/exams']);
  }
}
