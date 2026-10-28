import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

import { cn } from "@/lib/utils";

/**
 * 프로필 사진 아바타
 *
 * shadcn Base 레지스트리의 Avatar에서 크기와 색을 걷어 내고 둥근 틀만 남겼다.
 * 화면마다 크기·색·글자 크기 규칙이 달라 쓰는 쪽이 `className`으로 정한다.
 * 사진은 미리 받아 로드가 끝난 뒤에만 그리고, 그 전이나 실패하면 `AvatarFallback`이 보인다.
 */
function Avatar({
  className,
  ...props
}: Omit<AvatarPrimitive.Root.Props, "className"> & { className?: string }) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn("inline-flex shrink-0 overflow-hidden rounded-full", className)}
      {...props}
    />
  );
}

/** 아바타 옆에는 늘 닉네임이 함께 보여 사진은 화면 낭독기가 읽지 않는 꾸밈으로만 둔다. */
function AvatarImage({
  className,
  ...props
}: Omit<AvatarPrimitive.Image.Props, "className" | "alt"> & { className?: string }) {
  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn("size-full object-cover", className)}
      {...props}
      alt=""
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: Omit<AvatarPrimitive.Fallback.Props, "className"> & { className?: string }) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn("flex size-full items-center justify-center", className)}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback, AvatarImage };
