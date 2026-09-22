import { z } from "zod";

const projectName = z
  .string()
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(80, "Name must be 80 characters or fewer");

export const renameProjectSchema = z.object({
  id: z.string().uuid(),
  name: projectName,
});

export type RenameProjectValues = z.infer<typeof renameProjectSchema>;

export const projectIdSchema = z.object({
  id: z.string().uuid(),
});

export const setProjectArchivedSchema = z.object({
  id: z.string().uuid(),
  archived: z.boolean(),
});
