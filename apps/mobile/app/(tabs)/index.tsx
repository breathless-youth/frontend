import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-white">
      <Text className="text-xl font-semibold">FocusOn</Text>
      <Text className="text-sm text-gray-500">AI 비전 기반 순공 시간 측정 캠스터디</Text>
      <Pressable
        className="rounded-full bg-black px-6 py-3"
        onPress={() => router.push("/room/demo")}
      >
        <Text className="text-white">스터디룸 입장 (데모)</Text>
      </Pressable>
    </View>
  );
}
