import { createFileRoute, Link } from "@tanstack/react-router";
import z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const VerifySearchSchema = z.object({
  status: z.enum(["pending", "success", "error"]).default("pending"),
  error: z.string().optional(),
});

export const Route = createFileRoute("/_auth/verify-email")({
  validateSearch: VerifySearchSchema,
  component: VerifyEmailPage,
});

function VerifyEmailPage() {
  const { status, error } = Route.useSearch();

  if (status === "success") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email verified</CardTitle>
          <CardDescription>You're all set. Sign in to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" render={<Link to="/login" />}>
            Continue to sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === "error") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verification failed</CardTitle>
          <CardDescription>
            {error ?? "This verification link is invalid or expired."} Sign up again or request a new link from the
            sign-in page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button render={<Link to="/signup" />}>Sign up</Button>
          <Button variant="outline" render={<Link to="/login" />}>
            Sign in
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We sent a verification link to your email. Click it to activate your account. The link expires in 1 hour.
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
