let _selectedCase: any = null;

export const caseStore = {
  set: (item: any) => { _selectedCase = item; },
  get: () => _selectedCase,
  clear: () => { _selectedCase = null; },
