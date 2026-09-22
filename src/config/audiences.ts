export const AUDIENCE_VALUES = [
  "women",
  "men",
  "kids",
  "parents",
  "teachers",
  "pet_owners",
  "small_businesses",
  "crafters",
  "wedding_customers",
  "holiday_shoppers",
] as const;

export type AudienceValue = (typeof AUDIENCE_VALUES)[number];

export const audienceOptions: { value: AudienceValue; label: string }[] = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "kids", label: "Kids" },
  { value: "parents", label: "Parents" },
  { value: "teachers", label: "Teachers" },
  { value: "pet_owners", label: "Pet owners" },
  { value: "small_businesses", label: "Small businesses" },
  { value: "crafters", label: "Crafters" },
  { value: "wedding_customers", label: "Wedding customers" },
  { value: "holiday_shoppers", label: "Holiday shoppers" },
];
