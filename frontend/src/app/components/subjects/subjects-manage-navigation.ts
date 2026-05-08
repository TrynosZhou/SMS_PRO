export function isInSubjectsManageShell(url: string | undefined | null): boolean {
  return (url || '').split('?')[0].includes('/subjects/manage');
}

export function subjectsManageNav(url: string | undefined | null) {
  const inShell = isInSubjectsManageShell(url);

  return {
    listSegments: inShell ? ['/subjects/manage/manage-subject'] : ['/subjects'],
    addNewSegments: inShell ? ['/subjects/manage/add-new'] : ['/subjects/new'],
    editSegments: (id: string) =>
      inShell ? ['/subjects/manage/edit', id] : ['/subjects', id, 'edit'],
  };
}
