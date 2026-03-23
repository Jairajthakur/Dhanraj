import { Platform } from "react-native";

const STORE_KEY = "selected_case";
let _selectedCase: any = null;

export const caseStore = {
  set: (item: any) => {
    try {
      if (Platform.OS === "web") {
        sessionStorage.setItem(STORE_KEY, JSON.stringify(item));
      } else {
        _selectedCase = item;
      }
    } catch {
      _selectedCase = item;
    }
  },
  get: () => {
    try {
      if (Platform.OS === "web") {
        const v = sessionStorage.getItem(STORE_KEY);
        return v ? JSON.parse(v) : null;
      }
      return _selectedCase;
    } catch {
      return _selectedCase;
    }
  },
  clear: () => {
    try {
      if (Platform.OS === "web") {
        sessionStorage.removeItem(STORE_KEY);
      }
    } catch {}
    _selectedCase = null;
  },
};
