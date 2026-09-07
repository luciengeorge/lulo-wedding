import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { PasswordSchema } from "@/lib/schemas/auth";

const ChangePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .superRefine((val, ctx) => {
    if (val.newPassword !== val.confirmPassword) {
      ctx.addIssue({ path: ["confirmPassword"], code: "custom", message: "Passwords do not match" });
    }
  });

export const Route = createFileRoute("/app/settings/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const form = useForm({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
    validators: {
      onSubmit: ChangePasswordFormSchema,
      onSubmitAsync: async ({ value: { currentPassword, newPassword } }) => {
        try {
          const result = await authClient.changePassword({
            currentPassword,
            newPassword,
            revokeOtherSessions: true,
          });
          if (result.error) return { form: result.error.message };
        } catch (e) {
          return { form: e instanceof Error ? e.message : "Unknown error" };
        }
        toast.success("Password updated", { description: "Other sessions have been signed out." });
        form.reset();
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Updates your password and signs you out of all other devices for safety.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="currentPassword">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Current password</FieldLabel>
                    <Input
                      id={field.name}
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      required
                    />
                    {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )}
              </form.Field>
              <form.Field name="newPassword">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                    <Input
                      id={field.name}
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      required
                    />
                    <FieldDescription>Must be at least 8 characters long.</FieldDescription>
                    {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )}
              </form.Field>
              <form.Field
                name="confirmPassword"
                validators={{
                  onChangeListenTo: ["newPassword"],
                  onBlur: ({ value, fieldApi }) => {
                    if (value !== fieldApi.form.getFieldValue("newPassword")) return "Passwords do not match";
                  },
                }}
              >
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Confirm new password</FieldLabel>
                    <Input
                      id={field.name}
                      type="password"
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      required
                    />
                    {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )}
              </form.Field>
              <form.Subscribe
                selector={(state) => ({
                  canSubmit: state.canSubmit,
                  isSubmitting: state.isSubmitting,
                  errorMap: state.errorMap,
                })}
              >
                {({ canSubmit, isSubmitting, errorMap }) => (
                  <Field>
                    <Button type="submit" disabled={!canSubmit || isSubmitting} className="w-fit">
                      {isSubmitting ? <Spinner /> : null}
                      {isSubmitting ? "Saving" : "Update password"}
                    </Button>
                    {errorMap.onSubmit?.form ? <FieldError>{String(errorMap.onSubmit.form)}</FieldError> : null}
                  </Field>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
