import { capitalCase } from "change-case";
import z from "zod";

export const EmailSchema = z
  .string({ error: "Please enter a valid email address" })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Please enter a valid email address" }));

export const NameSchema = z
  .string({ error: "Name is required" })
  .min(2, { error: "Name is too short" })
  .max(40, { error: "Name is too long" })
  .transform((value) => capitalCase(value.trim()));

export const PasswordSchema = z
  .string({ error: "Please enter a password" })
  .min(8, { error: "Password is too short" })
  .max(100, { error: "Password is too long" })
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    error:
      "Password should be at least 8 characters and must contain at least one uppercase letter, one lowercase letter, and one number",
  });

export const LoginFormSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
});

export const SignupFormSchema = z
  .object({
    name: NameSchema,
    email: EmailSchema,
    password: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        path: ["confirmPassword"],
        code: "custom",
        message: "Passwords do not match",
      });
    }
  });

export const ForgotPasswordFormSchema = z.object({
  email: EmailSchema,
});

export const ResetPasswordFormSchema = z
  .object({
    password: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .superRefine((val, ctx) => {
    if (val.password !== val.confirmPassword) {
      ctx.addIssue({
        path: ["confirmPassword"],
        code: "custom",
        message: "Passwords do not match",
      });
    }
  });

export const MagicLinkFormSchema = z.object({
  email: EmailSchema,
});
