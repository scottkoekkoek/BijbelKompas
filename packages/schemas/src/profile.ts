import { z } from "zod";
import { Preferences } from "./preferences";

export const Me = z.object({
  userId: z.uuid(),
  email: z.email().nullable(),
  displayName: z.string().nullable(),
  preferences: Preferences,
});
export type Me = z.infer<typeof Me>;
