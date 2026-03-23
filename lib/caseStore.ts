// lib/caseStore.ts
// Uses sessionStorage so data survives full-page navigation on web (Railway/static deploy)

const STORE_KEY = "fos_selected_case";
let _mem: any = null;

function isWeb(): boolean {
  return typeof window !== "undefined" && typeof sessionStorage !== "undefined";
}

export const caseStore = {
  set: (item: any) => {
    _mem = item;
    if (isWeb()) {
      try {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(item));
      } catch {}
    }
  },

  get: (): any => {
    // Try memory first (native app)
    if (_mem) return _mem;
    // Fall back to sessionStorage (web)
    if (isWeb()) {
      try {
        const v = sessionStorage.getItem(STORE_KEY);
        if (v) {
          _mem = JSON.parse(v);
          return _mem;
        }
      } catch {}
    }
    return null;
  },

  clear: () => {
    _mem = null;
    if (isWeb()) {
      try { sessionStorage.removeItem(STORE_KEY); } catch {}
    }
  },
};
