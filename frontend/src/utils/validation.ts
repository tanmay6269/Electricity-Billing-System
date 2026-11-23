import { z } from "zod";

export const PASSWORD_HINT = "8-64 characters with upper case, lower case, a number and a special character.";
export const strongPassword = z
  .string()
  .min(8, "At least 8 characters")
  .max(64, "At most 64 characters")
  .regex(/[a-z]/, "Add a lower-case letter")
  .regex(/[A-Z]/, "Add an upper-case letter")
  .regex(/\d/, "Add a number")
  .regex(/[^A-Za-z0-9]/, "Add a special character");

export const newPasswordSchema = z
  .object({ new_password: strongPassword, confirm: z.string() })
  .refine((d) => d.new_password === d.confirm, { message: "Passwords do not match", path: ["confirm"] });
export type NewPassword = z.infer<typeof newPasswordSchema>;

export const phone = z
  .string()
  .trim()
  .regex(/^(\+91)?[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");
export const pin = z.string().trim().regex(/^\d{6}$/, "6-digit postal code");
export const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a billing month");
