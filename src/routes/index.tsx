import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Starter Template";

function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="text-lg font-semibold">
            {APP_NAME}
          </Link>
          <nav className="flex items-center gap-2">
            <Button variant="ghost" size="sm" render={<Link to="/login" />}>
              Sign in
            </Button>
            <Button size="sm" render={<Link to="/signup" />}>
              Get started
            </Button>
          </nav>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-5xl font-bold tracking-tight text-balance sm:text-6xl">{APP_NAME}</h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground">
            A starter template wired with auth, billing, AI, and observability — replace this copy with your product
            pitch.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3">
            <Button size="lg" render={<Link to="/signup" />}>
              Get started
            </Button>
            <Button size="lg" variant="outline" render={<Link to="/login" />}>
              Sign in
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 text-sm">
          <p className="text-muted-foreground">
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
          <nav className="flex gap-4 text-muted-foreground">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/cookies" className="hover:text-foreground">
              Cookies
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
