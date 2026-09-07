import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvex } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/app/settings/danger")({
  component: DangerZonePage,
});

function DangerZonePage() {
  const { session } = Route.useRouteContext();
  const convex = useConvex();
  const navigate = useNavigate();
  const [confirmInput, setConfirmInput] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!session) return null;

  const expectedConfirm = "delete my account";
  const canDelete = confirmInput.trim().toLowerCase() === expectedConfirm;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const data = await convex.query(api.users.exportMyData, {});
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Data exported", { description: "Your data has been downloaded." });
    } catch (e) {
      toast.error("Export failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    setIsDeleting(true);
    try {
      const result = await authClient.deleteUser({ callbackURL: "/" });
      if (result.error) {
        setDeleteError(result.error.message ?? null);
        return;
      }
      toast.success("Confirmation sent", {
        description: "Check your email to confirm account deletion.",
      });
      navigate({ to: "/" });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
          <CardDescription>
            Download a JSON file with everything we have on file for your account (UK GDPR Art. 20).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExport} disabled={isExporting} variant="outline" className="w-fit">
            {isExporting ? <Spinner /> : null}
            {isExporting ? "Preparing" : "Download my data"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Delete account</CardTitle>
          <CardDescription>
            Permanently deletes your account and all associated data. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="confirm">
                Type <span className="font-mono font-semibold">{expectedConfirm}</span> to confirm
              </FieldLabel>
              <Input
                id="confirm"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={expectedConfirm}
              />
              <FieldDescription>You'll receive a confirmation email — the deletion is final.</FieldDescription>
            </Field>
            <Field>
              <Button
                onClick={handleDelete}
                disabled={!canDelete || isDeleting}
                variant="destructive"
                className="w-fit"
              >
                {isDeleting ? <Spinner /> : null}
                {isDeleting ? "Sending" : "Delete my account"}
              </Button>
              {deleteError ? <FieldError>{deleteError}</FieldError> : null}
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
