import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { AnalyticsEvent, useAnalytics } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { LoginFormSchema } from "@/lib/schemas/auth";

export const Route = createFileRoute("/_auth/login")({ component: LoginPage });

function LoginPage() {
  const { capture } = useAnalytics();
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: LoginFormSchema,
      onSubmitAsync: async ({ value: { email, password } }) => {
        capture(AnalyticsEvent.userLoginSubmitted, { login_method: "email" });

        try {
          const result = await authClient.signIn.email({ email, password });
          if (result.error) {
            capture(AnalyticsEvent.userLoginFailed, {
              error_message: result.error.message,
              login_method: "email",
            });
            return { form: result.error.message };
          }

          capture(AnalyticsEvent.userLoggedIn, { login_method: "email" });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown login error";
          capture(AnalyticsEvent.userLoginFailed, {
            error_message: message,
            login_method: "email",
          });
          return { form: message };
        }

        toast.success("Welcome back!", { description: "Login successful" });
        navigate({ to: "/" });
      },
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    form.handleSubmit();
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>Enter your email below to login to your account</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <OAuthButtons callbackURL="/app" />
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <form.Field name="email">
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      type="email"
                      placeholder="Enter your email"
                      required
                    />
                    {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )}
              </form.Field>
              <form.Field name="password">
                {(field) => (
                  <Field>
                    <div className="flex items-center">
                      <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                      <Link
                        to="/forgot-password"
                        className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                      >
                        Forgot your password?
                      </Link>
                    </div>
                    <Input
                      id={field.name}
                      name={field.name}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      type="password"
                      placeholder="Enter your password"
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
                      {isSubmitting ? "Logging in" : "Login"}
                    </Button>
                    {errorMap.onSubmit?.form ? <FieldError>{String(errorMap.onSubmit.form)}</FieldError> : null}
                    <FieldDescription className="text-center">
                      Don't have an account? <Link to="/signup">Sign up</Link>
                    </FieldDescription>
                    <FieldDescription className="text-center">
                      <Link to="/magic-link">Sign in with a magic link instead</Link>
                    </FieldDescription>
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
