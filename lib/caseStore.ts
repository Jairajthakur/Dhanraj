// lib/caseStore.ts
// Simple global store to pass case data between screens
// Avoids Expo Router URL param size limits

let _selectedCase: any = null;

export const caseStore = {
  set: (item: any) => {
    _selectedCase = item;
  },
  get: () => _selectedCase,
  clear: () => {
    _selectedCase = null;
  },
};
