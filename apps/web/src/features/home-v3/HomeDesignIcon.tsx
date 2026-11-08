import chevron from "@/assets/home-v3/chevron-right.svg";
import subjectChevron from "@/assets/home-v3/subject-chevron.svg";
import play from "@/assets/home-v3/play.svg";
import video from "@/assets/home-v3/video.svg";
import settings from "@/assets/home-v3/settings.svg";
import lock from "@/assets/home-v3/lock.svg";
import { cn } from "@/lib/utils";

const icons = {
  chevron: { src: chevron, size: "h-3 w-1.75" },
  subjectChevron: { src: subjectChevron, size: "size-4" },
  play: { src: play, size: "size-5" },
  video: { src: video, size: "size-5" },
  settings: { src: settings, size: "size-5" },
  lock: { src: lock, size: "size-5" },
};

/** Figma 원본 도형을 유지하고 색만 현재 테마 토큰을 따른다. */
export function HomeDesignIcon({
  name,
  className,
}: {
  name: keyof typeof icons;
  className?: string;
}) {
  const icon = icons[name];
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block shrink-0 bg-current", icon.size, className)}
      style={{ maskImage: `url("${icon.src}")`, maskRepeat: "no-repeat", maskPosition: "center" }}
    />
  );
}
