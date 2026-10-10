import { z } from "zod";

import { contactSubjects } from "@/config/contact";

/** Strips control characters (except newlines/tabs) and trims. */
const cleanText = (max: number) =>
  z
    .string()
    .transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().max(max));

const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);

/** Hidden field that real users never fill in. */
const honeypot = z.string().max(0).optional().or(z.literal(""));

export const contactSchema = z.object({
  name: cleanText(100).pipe(z.string().min(1, "Enter your name.")),
  email,
  orderNumber: cleanText(40).optional().default(""),
  subject: z.enum(Object.keys(contactSubjects) as [keyof typeof contactSubjects, ...(keyof typeof contactSubjects)[]], {
    errorMap: () => ({ message: "Choose a subject." }),
  }),
  message: cleanText(4000).pipe(z.string().min(10, "Please include a few more details (10 characters minimum).")),
  company: honeypot,
});
export type ContactInput = z.infer<typeof contactSchema>;

export const newsletterSchema = z.object({ email, company: honeypot });

export const trackingSchema = z.object({
  orderNumber: cleanText(40).pipe(z.string().min(3, "Enter your order number.")),
  email,
  company: honeypot,
});

export const checkoutSchema = z.object({
  lines: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(50),
});

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
