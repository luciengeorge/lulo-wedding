import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  role?: string;
  createdAt: string | Date;
}

export const Route = createFileRoute("/app/admin")({
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await authClient.admin.listUsers({ query: { limit: 100 } });
        if (cancelled) return;
        if (result.error) {
          setError(result.error.message ?? null);
          return;
        }
        setUsers((result.data?.users ?? []) as AdminUser[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Make sure your user ID is in the <code className="font-mono">ADMIN_USER_IDS</code> env var on the Convex
            deployment.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (users === null) {
    return (
      <div className="flex items-center gap-2">
        <Spinner /> Loading users…
      </div>
    );
  }

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return u.email.toLowerCase().includes(q) || (u.name ?? "").toLowerCase().includes(q);
  });

  const handleImpersonate = async (userId: string) => {
    setBusyId(userId);
    try {
      const result = await authClient.admin.impersonateUser({ userId });
      if (result.error) {
        toast.error("Impersonate failed", { description: result.error.message });
        return;
      }
      toast.success("Now impersonating");
      navigate({ to: "/app" });
    } catch (e) {
      toast.error("Impersonate failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-muted-foreground">{users.length} users. Impersonate anyone to debug their account.</p>
      </header>

      <Input
        type="search"
        placeholder="Search by email or name"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <ul className="flex flex-col gap-2">
        {filtered.map((u) => {
          const initials = u.name
            ? u.name
                .split(" ")
                .map((p) => p[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
            : u.email[0]?.toUpperCase();
          return (
            <li key={u.id} className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10">
                  <AvatarImage alt={u.name || u.email} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{u.name || u.email}</p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {u.role === "admin" ? (
                  <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">admin</span>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => handleImpersonate(u.id)} disabled={busyId !== null}>
                  {busyId === u.id ? <Spinner /> : null}
                  {busyId === u.id ? "Working" : "Impersonate"}
                </Button>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 ? <li className="text-sm text-muted-foreground">No matches</li> : null}
      </ul>
    </div>
  );
}
