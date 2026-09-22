export const STYLE_VALUES = [
  "minimal",
  "vintage",
  "retro",
  "cute",
  "cartoon",
  "boho",
  "hand_drawn",
  "typography",
  "watercolor",
  "line_art",
  "modern",
  "luxury",
  "funny",
  "kids",
  "floral",
] as const;

export type StyleValue = (typeof STYLE_VALUES)[number];

export const styleOptions: { value: StyleValue; label: string }[] = [
  { value: "minimal", label: "Minimal" },
  { value: "vintage", label: "Vintage" },
  { value: "retro", label: "Retro" },
  { value: "cute", label: "Cute" },
  { value: "cartoon", label: "Cartoon" },
  { value: "boho", label: "Boho" },
  { value: "hand_drawn", label: "Hand Drawn" },
  { value: "typography", label: "Typography" },
  { value: "watercolor", label: "Watercolor" },
  { value: "line_art", label: "Line Art" },
  { value: "modern", label: "Modern" },
  { value: "luxury", label: "Luxury" },
  { value: "funny", label: "Funny" },
  { value: "kids", label: "Kids" },
  { value: "floral", label: "Floral" },
];
