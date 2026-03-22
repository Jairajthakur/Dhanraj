import { Redirect } from "expo-router";

// The root index just redirects to /login.
// All auth logic and role-based routing is handled in app/_layout.tsx (RootLayoutNav).
export default function Index() {
  return <Redirect href="/login" />;
}
