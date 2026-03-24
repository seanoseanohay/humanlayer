import { z } from "zod";

export const createSessionSchema = z.object({
  prompt: z.string().min(1, "Prompt is required").max(10000),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const sessionIdParamSchema = z.object({
  id: z.string().uuid("Invalid session ID"),
});
