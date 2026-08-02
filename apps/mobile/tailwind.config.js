/**
 * 색상/반경 값은 Figma "FocusON V1.0 Design"(KmTbXL79g6ximY1RcnBZDz) Foundations의
 * 시맨틱 토큰과 동일 — packages/design-tokens/src/index.ts 참고. tailwind.config.js는
 * 플레인 Node(require)로 로드되고 @focusmakers/design-tokens는 컴파일된 JS 산출물이 없는
 * TS 소스(main: ./src/index.ts)라 require로 가져올 수 없다 — 값을 그대로 옮겨적는다.
 * `-dark` 접미사 키는 다크 모드 값이다: 예) className="bg-bg-base dark:bg-bg-base-dark".
 */
const colors = {
  bg: {
    base: "#ffffff",
    "base-dark": "#101419",
    dim: "#00000066",
    "dim-dark": "#00000099",
    guide: "#f3f8fe",
    "guide-dark": "#152030",
    layer1: "#f9fafb",
    "layer1-dark": "#191f28",
    layer2: "#f2f4f6",
    "layer2-dark": "#333d4b",
  },
  border: {
    default: "#e5e8eb",
    "default-dark": "#333d4b",
    strong: "#d1d6db",
    "strong-dark": "#4e5968",
  },
  brand: {
    primary: "#1b64da",
    "primary-dark": "#3182f6",
    hover: "#1957c2",
    "hover-dark": "#4593fc",
    subtle: "#e8f3ff",
    "subtle-dark": "#1b2b4d",
    subtlePressed: "#c9e2ff",
    "subtlePressed-dark": "#194aa6",
  },
  feedback: {
    error: "#f04452",
    "error-dark": "#ff6b77",
    errorSubtle: "#ffebee",
    "errorSubtle-dark": "#3d1b1f",
    success: "#12b76a",
    "success-dark": "#32d583",
  },
  state: {
    focus: "#1b64da",
    "focus-dark": "#4593fc",
    focusSubtle: "#e8f3ff",
    "focusSubtle-dark": "#1b2b4d",
    distract: "#ff8a00",
    "distract-dark": "#ff9e1b",
    distractSubtle: "#fff4e5",
    "distractSubtle-dark": "#3d2e14",
    distractText: "#b36100",
    "distractText-dark": "#ff9e1b",
  },
  text: {
    primary: "#191f28",
    "primary-dark": "#f9fafb",
    secondary: "#6b7684",
    "secondary-dark": "#b0b8c1",
    tertiary: "#8b95a1",
    disabled: "#d1d6db",
    "disabled-dark": "#4e5968",
    inverse: "#ffffff",
    "inverse-dark": "#101419",
    onBrand: "#ffffff",
  },
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  darkMode: "media",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors,
      borderRadius: {
        xs: "4px",
        sm: "8px",
        md: "12px",
        lg: "16px",
        xl: "20px",
        full: "9999px",
      },
    },
  },
  plugins: [],
};
