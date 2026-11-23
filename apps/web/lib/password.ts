import { z } from "zod";

/** The password rules (BK-003), shared by "nieuw wachtwoord" and the pilot links. */
export const NewPassword = z
  .object({
    password: z
      .string()
      .min(12, { message: "Gebruik minstens 12 tekens." })
      .regex(/[a-z]/, { message: "Gebruik minstens één kleine letter." })
      .regex(/[A-Z]/, { message: "Gebruik minstens één hoofdletter." })
      .regex(/[0-9]/, { message: "Gebruik minstens één cijfer." }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "De wachtwoorden zijn niet gelijk.", path: ["confirm"] });
