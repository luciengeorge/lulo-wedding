import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AnalyticsEvent, useAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { MagicLinkFormSchema } from "@/lib/schemas/auth";
import { seo } from "@/lib/seo";

/**
 * The only door.
 *
 * There are exactly two accounts and both are Gmail addresses, so a password
 * is a credential to lose rather than a convenience. The password form and the
 * separate /magic-link page are gone; this is the single sign-in surface.
 *
 * Password endpoints still exist server-side but are not reachable from the UI,
 * which leaves a recovery path without putting a second door on the page.
 */
export const Route = createFileRoute("/_auth/login")({
  head: () => ({
    meta: seo({ title: "Sign in", description: "Sign in to the guest list.", path: "/login", noPreview: true }),
  }),
  component: LoginPage,
});

function LoginPage() {
  const { capture } = useAnalytics();
  const [sentTo, setSentTo] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "" },
    validators: {
      onSubmit: MagicLinkFormSchema,
      onSubmitAsync: async ({ value: { email } }) => {
        capture(AnalyticsEvent.userLoginSubmitted, { login_method: "magic_link" });
        try {
          const result = await authClient.signIn.magicLink({ email, callbackURL: "/admin" });
          if (result.error) {
            capture(AnalyticsEvent.userLoginFailed, {
              error_message: result.error.message,
              login_method: "magic_link",
            });
            return { form: result.error.message };
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          capture(AnalyticsEvent.userLoginFailed, { error_message: message, login_method: "magic_link" });
          return { form: message };
        }
        setSentTo(email);
      },
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    form.handleSubmit();
  };

  if (sentTo) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            {/* The address is echoed back because a typo is the likeliest reason
                nothing arrives, and the server answers identically either way. */}
            We sent a sign-in link to {sentTo}. It expires in 5 minutes and can only be used once.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
            Use a different address
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          For Laura, Lucien and the people helping them plan. Guests do not need an account: they use the password from
          their invitation.
        </CardDescription>
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
                    autoComplete="email"
                    placeholder="you@example.com"
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
                    {isSubmitting ? "Sending" : "Email me a sign-in link"}
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
