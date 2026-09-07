import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { ResetPasswordFormSchema } from "@/lib/schemas/auth";

const ResetSearchSchema = z.object({
  token: z.string().min(1).optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/_auth/reset-password")({
  validateSearch: ResetSearchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error } = Route.useSearch();
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: { password: "", confirmPassword: "" },
    validators: {
      onSubmit: ResetPasswordFormSchema,
      onSubmitAsync: async ({ value: { password } }) => {
        if (!token) {
          return { form: "Reset link is invalid or expired. Request a new one." };
        }

        try {
          const result = await authClient.resetPassword({ newPassword: password, token });
          if (result.error) {
            return { form: result.error.message };
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : "Unknown error";
          return { form: message };
        }

        toast.success("Password reset", { description: "You can now sign in with your new password." });
        navigate({ to: "/login" });
      },
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    form.handleSubmit();
  };

  if (error || !token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Reset link expired</CardTitle>
          <CardDescription>This link is no longer valid. Request a new one to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link to="/forgot-password" />}>
            Request a new link
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>Choose a new password for your account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <form.Field name="password">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>New password</FieldLabel>
                  <Input
                    id={field.name}
                    type="password"
                    placeholder="Enter your new password"
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
                onChangeListenTo: ["password"],
                onBlur: ({ value, fieldApi }) => {
                  if (value !== fieldApi.form.getFieldValue("password")) return "Passwords do not match";
                },
              }}
            >
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Confirm new password</FieldLabel>
                  <Input
                    id={field.name}
                    type="password"
                    placeholder="Confirm your new password"
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
                  <Button type="submit" disabled={!canSubmit || isSubmitting}>
                    {isSubmitting ? <Spinner /> : null}
                    {isSubmitting ? "Saving" : "Save new password"}
                  </Button>
                  {errorMap.onSubmit?.form ? <FieldError>{String(errorMap.onSubmit.form)}</FieldError> : null}
                </Field>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
