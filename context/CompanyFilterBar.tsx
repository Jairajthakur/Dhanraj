import React from "react";
import { ScrollView, Pressable, Text, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  companies: string[];
  selected: string;
  onSelect: (company: string) => void;
}

export function CompanyFilterBar({ companies, selected, onSelect }: Props) {
  if (!companies || companies.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        <Pressable
          style={[styles.chip, selected === "All" && styles.chipActive]}
          onPress={() => onSelect("All")}
        >
          <Ionicons
            name="business-outline"
            size={11}
            color={selected === "All" ? "#fff" : "#534ab7"}
          />
          <Text style={[styles.chipText, selected === "All" && styles.chipTextActive]}>
            All
          </Text>
        </Pressable>

        {companies.map((company) => {
          const isActive = selected === company;
          return (
            <Pressable
              key={company}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onSelect(isActive ? "All" : company)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]} numberOfLines={1}>
                {company}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 4,
  },
  container: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#eeedfe",
    borderWidth: 1,
    borderColor: "#afa9ec",
  },
  chipActive: {
    backgroundColor: "#534ab7",
    borderColor: "transparent",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#534ab7",
  },
  chipTextActive: {
    color: "#fff",
  },
});
