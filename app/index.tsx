import { useEffect } from "react";
import { useRouter } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { useAuth } from "@/context/AuthContext";

export default function Index() {
  const { agent, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (agent) {
      // Logged in — redirect to main app
      // Adjust this route to match your actual authenticated home screen
      router.replace("/(tabs)");
    } else {
      // Not logged in — redirect to login screen
      router.replace("/(app)/login");
    }
  }, [agent, isLoading]);

  // Show spinner while auth state loads
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1a1a1a" }}>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}
