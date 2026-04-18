import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";

interface CompanyFilterBarProps {
  companies: string[];
  selected: string | null;
  onSelect: (company: string | null) => void;
}

export function CompanyFilterBar({
  companies,
  selected,
  onSelect,
}: CompanyFilterBarProps) {
  if (!companies || companies.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <TouchableOpacity
          style={[styles.chip, selected === null && styles.chipActive]}
          onPress={() => onSelect(null)}
        >
          <Text style={[styles.chipText, selected === null && styles.chipTextActive]}>
            All
          </Text>
        </TouchableOpacity>

        {companies.map((company) => (
          <TouchableOpacity
            key={company}
            style={[styles.chip, selected === company && styles.chipActive]}
            onPress={() => onSelect(company)}
          >
            <Text
              style={[
                styles.chipText,
                selected === company && styles.chipTextActive,
              ]}
              numberOfLines={1}
            >
              {company}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: "#0f172a",
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  scroll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    marginRight: 8,
  },
  chipActive: {
    backgroundColor: "#ff6b00",
    borderColor: "#ff6b00",
  },
  chipText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "500",
  },
  chipTextActive: {
    color: "#ffffff",
    fontWeight: "700",
  },
});
