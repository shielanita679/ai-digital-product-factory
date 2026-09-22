import { z } from "zod";

export const startGenerationSchema = z.object({
  projectId: z.string().uuid(),
});

export const designIdSchema = z.object({
  id: z.string().uuid(),
});
