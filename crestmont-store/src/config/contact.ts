export const contactSubjects = {
  order: "Order question",
  shipping: "Shipping or delivery",
  return: "Return or refund",
  product: "Product question",
  other: "Something else",
} as const;

export type ContactSubject = keyof typeof contactSubjects;
