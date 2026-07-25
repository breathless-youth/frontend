import { Text, View } from "react-native";

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white">
      <Text className="text-xl font-semibold">FocusOn</Text>
      <Text className="text-sm text-gray-500">AI 비전 기반 순공 시간 측정 캠스터디</Text>
    </View>
  );
}
