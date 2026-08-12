// app/index.tsx — Phase 2 v2.11 Canonical Index Screen

import React from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { TwoToneWrapper } from "@/components/TwoToneWrapper";
import { COLORS } from "@/constants/theme";

export default function Index() {
  return (
    <TwoToneWrapper title="">
      <View className="flex-1 justify-center items-center gap-4 py-20">
        <ActivityIndicator size="large" color={COLORS.vjAccent} />
        <Text className="text-vj-text/50 font-bold text-sm uppercase tracking-widest">
          Initializing VJ Billing...
        </Text>
      </View>
    </TwoToneWrapper>
  );
}