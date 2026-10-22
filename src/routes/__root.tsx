import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";

import { GlobalLoading } from "@/components/global-loading";
import { Toaster } from "@/components/ui/sonner";
import { useToast } from "@/hooks/use-toast";
import { getToast } from "@/lib/functions/get-toast";

import ConvexProvider from "../integrations/convex/provider";
import { GoogleAnalyticsPageViews, GoogleAnalyticsScripts } from "../integrations/google-analytics/provider";
import PostHogProvider from "../integrations/posthog/provider";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider";
import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

import { seo } from "@/lib/seo";

const DEFAULT_DESCRIPTION = "Laura and Lucien are getting married on 17 July 2027 in Lebanon.";

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const serverToast = await getToast();
    return { serverToast };
  },
  component: RootComponent,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // Private event. Nothing here should ever be indexed.
      { name: "robots", content: "noindex, nofollow" },
      { name: "theme-color", content: "#F9F1E5" },
      ...seo({ description: DEFAULT_DESCRIPTION }),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // No canonical here on purpose: TanStack merges `meta` by name/property
      // but simply concatenates `links`, so a root canonical plus a page
      // canonical renders BOTH and a page with two canonicals has none that
      // counts. Each route declares its own.
      // Transparent, so the mark sits on the tab itself. The SVG turns paper-cream
      // in dark mode, where ink red would vanish against a dark tab; browsers
      // without SVG icons use the .ico, which carries a thickened 16px variant
      // alongside the full artwork at 32 and 48. The touch icon keeps its paper
      // ground: iOS fills transparency with black.
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootComponent() {
  const { serverToast } = Route.useRouteContext();
  useToast(serverToast);

  return <Outlet />;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <GoogleAnalyticsScripts />
      </head>
      <body className="font-sans antialiased">
        <GlobalLoading />
        <Analytics />
        <SpeedInsights />
        <GoogleAnalyticsPageViews />
        <ConvexProvider>
          <PostHogProvider>
            <TanStackQueryProvider>
              <Toaster closeButton richColors />
              <main className="isolate flex min-h-svh w-full flex-col">{children}</main>
              <TanStackDevtools
                config={{ position: "bottom-right" }}
                plugins={[
                  {
                    name: "Tanstack Router",
                    render: <TanStackRouterDevtoolsPanel />,
                  },
                  TanStackQueryDevtools,
                ]}
              />
            </TanStackQueryProvider>
          </PostHogProvider>
        </ConvexProvider>
        <Scripts />
      </body>
    </html>
  );
}
