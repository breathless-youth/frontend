import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ensureUserRegistered } from "../lib/userApi";

export default function RootLayout() {
  useEffect(() => {
    void ensureUserRegistered({ resetIdentity: __DEV__ });
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="room/[id]" options={{ headerShown: true, title: "스터디룸" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
