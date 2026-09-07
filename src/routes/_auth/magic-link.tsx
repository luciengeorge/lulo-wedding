import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { MagicLinkFormSchema } from "@/lib/schemas/auth";

export const Route = createFileRoute("/_auth/magic-link")({
  component: MagicLinkPage,
});

function MagicLinkPage() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm({
    defaultValues: { email: "" },
    validators: {
      onSubmit: MagicLinkFormSchema,
      onSubmitAsync: async ({ value: { email } }) => {
        try {
          const result = await authClient.signIn.magicLink({
            email,
            callbackURL: "/",
          });
          if (result.error) {
            return { form: result.error.message };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return { form: message };
        }
        setSubmitted(true);
      },
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    form.handleSubmit();
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We've sent you a sign-in link. It expires in 5 minutes and can only be used once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" render={<Link to="/login" />}>
            Back to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in with magic link</CardTitle>
        <CardDescription>Enter your email and we'll send you a one-time sign-in link.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <form.Field name="email">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                  <Input
                    id={field.name}
                    type="email"
                    placeholder="Enter your email"
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
                    {isSubmitting ? "Sending" : "Send magic link"}
                  </Button>
                  {errorMap.onSubmit?.form ? <FieldError>{String(errorMap.onSubmit.form)}</FieldError> : null}
                  <FieldDescription className="text-center">
                    Prefer a password? <Link to="/login">Sign in with password</Link>
                  </FieldDescription>
                </Field>
              )}
            </form.Subscribe>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}
