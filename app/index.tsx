import { View, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.primaryDark }}>
      <ActivityIndicator color={Colors.primaryLight} size="large" />
    </View>
  );
}
