import {
  AudioLines,
  AudioWaveform,
  CloudDrizzle,
  CloudRain,
  Coffee,
  Music,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { SoundId } from "../catalog";

/**
 * 소리마다의 아이콘. 카탈로그는 런타임에 받아 오므로 여기에 없는 id 가 올 수 있고, 그때는
 * 음표로 떨어진다. 전부 lucide 라 선 굵기와 끝 처리가 같아 한 벌로 보인다.
 *
 * 카탈로그에 소리를 추가하면 여기에도 한 줄을 더한다. 안 더해도 화면은 깨지지 않지만
 * 음표 아이콘이 둘이 되어 사용자가 구분하지 못한다.
 */
const ICONS: Record<SoundId, LucideIcon> = {
  white: AudioWaveform,
  pink: AudioLines,
  brown: Waves,
  "rain-trp": CloudRain,
  "rain-mm": CloudDrizzle,
  "cafe-vec": Coffee,
};

export function soundIcon(id: SoundId): LucideIcon {
  return ICONS[id] ?? Music;
}
