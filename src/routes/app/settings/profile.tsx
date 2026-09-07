import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { EmailSchema, NameSchema } from "@/lib/schemas/auth";

export const Route = createFileRoute("/app/settings/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { session } = Route.useRouteContext();
  const [emailSubmitted, setEmailSubmitted] = useState(false);

  const nameForm = useForm({
    defaultValues: { name: session?.user.name ?? "" },
    validators: {
      onSubmitAsync: async ({ value: { name } }) => {
        try {
          const result = await authClient.updateUser({ name });
          if (result.error) return { form: result.error.message };
        } catch (e) {
          return { form: e instanceof Error ? e.message : "Unknown error" };
        }
        toast.success("Name updated");
      },
    },
  });

  const emailForm = useForm({
    defaultValues: { newEmail: "" },
    validators: {
      onSubmitAsync: async ({ value: { newEmail } }) => {
        try {
          const result = await authClient.changeEmail({ newEmail });
          if (result.error) return { form: result.error.message };
        } catch (e) {
          return { form: e instanceof Error ? e.message : "Unknown error" };
        }
        setEmailSubmitted(true);
      },
    },
  });

  if (!session) return null;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Name</CardTitle>
          <CardDescription>This is how you'll appear across the app.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              nameForm.handleSubmit();
            }}
          >
            <FieldGroup>
              <nameForm.Field name="name" validators={{ onBlur: NameSchema }}>
                {(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                    <Input
                      id={field.name}
                      value={field.state.value}
                      onChange={(e) => field.handleChange(e.target.value)}
                      onBlur={field.handleBlur}
                      required
                    />
                    {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
                  </Field>
                )}
              </nameForm.Field>
              <nameForm.Subscribe
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
                      {isSubmitting ? "Saving" : "Save name"}
                    </Button>
                    {errorMap.onSubmit?.form ? <FieldError>{String(errorMap.onSubmit.form)}</FieldError> : null}
                  </Field>
                )}
              </nameForm.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email</CardTitle>
          <CardDescription>
            Current email: <span className="font-medium text-foreground">{session.user.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {emailSubmitted ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                We sent a confirmation link to your current email address. Click it to complete the change.
              </p>
              <Button variant="outline" onClick={() => setEmailSubmitted(false)} className="w-fit">
                Use a different new email
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                emailForm.handleSubmit();
              }}
            >
              <FieldGroup>
                <emailForm.Field name="newEmail" validators={{ onBlur: EmailSchema }}>
                  {(field) => (
                    <Field>
                      <FieldLabel htmlFor={field.name}>New email</FieldLabel>
                      <Input
                        id={field.name}
                        type="email"
                        placeholder="new@email.com"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        onBlur={field.handleBlur}
                        required
                      />
                      <FieldDescription>You'll need to confirm via your current email.</FieldDescription>
                      {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  )}
                </emailForm.Field>
                <emailForm.Subscribe
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
                        {isSubmitting ? "Sending" : "Request email change"}
                      </Button>
                      {errorMap.onSubmit?.form ? <FieldError>{String(errorMap.onSubmit.form)}</FieldError> : null}
                    </Field>
                  )}
                </emailForm.Subscribe>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
