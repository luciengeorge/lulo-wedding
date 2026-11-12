import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { FEATURES } from "@/lib/flags";
import { cn } from "@/lib/utils";

export const INFO_SECTIONS = [
  { id: "schedule", label: "Schedule" },
  { id: "travel", label: "Travel" },
  { id: "stay", label: "Stay" },
  { id: "faq", label: "FAQ" },
  { id: "discover", label: "Discover" },
  { id: "registry", label: "Registry" },
] as const;

/**
 * The bar that follows the reader down the page.
 *
 * It sits at the foot of the first screen, under the hero, so a guest on a
 * phone can see there is more below, then sticks to the top once scrolled to.
 * RSVP stays in reach the whole way down.
 */
export function JumpBar() {
  const active = useActiveSection();
  const linksRef = useRef<HTMLDivElement>(null);

  // On a phone the links scroll sideways; keep the current one in view. Scrolls
  // the strip itself, not scrollIntoView, which would also move the page.
  useEffect(() => {
    const strip = linksRef.current;
    const link = active ? strip?.querySelector<HTMLElement>(`[data-section="${active}"]`) : null;
    if (!strip || !link || strip.scrollWidth <= strip.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({
      left: link.offsetLeft - strip.clientWidth / 2 + link.offsetWidth / 2,
      behavior: reduce ? "auto" : "smooth",
    });
  }, [active]);

  return (
    <nav
      aria-label="On this page"
      className="sticky top-0 z-30 flex h-(--jump-h) items-center border-b border-rule bg-paper lg:px-12"
    >
      {/* Name from xl up: at 1024px the side columns must narrow for the links to fit. */}
      <a
        href="#top"
        onClick={(event) => jumpTo(event, "top")}
        aria-label="Laura and Lucien"
        className="hidden w-[140px] shrink-0 items-center gap-3.5 lg:flex xl:w-[220px]"
      >
        <img src="/art/monogram-ink.svg" alt="" className="h-[31px] w-[30px]" />
        <span aria-hidden className="hidden font-script text-2xl leading-7 text-ink xl:inline">
          Laura and Lucien
        </span>
      </a>

      <div
        ref={linksRef}
        className="relative flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%_-_4rem),transparent)] pl-5 lg:justify-center lg:gap-9 lg:overflow-visible lg:[mask-image:none] lg:pl-0 [&::-webkit-scrollbar]:hidden"
      >
        {INFO_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            data-section={section.id}
            aria-current={active === section.id ? "location" : undefined}
            onClick={(event) => jumpTo(event, section.id)}
            className={cn(
              "shrink-0 border-b pb-0.5 font-display text-xs font-semibold tracking-[0.18em] whitespace-nowrap uppercase transition-colors lg:text-[13px]",
              active === section.id ? "border-ink text-ink" : "border-transparent text-faded hover:text-ink",
            )}
          >
            {section.label}
          </a>
        ))}
        {/* As wide as the fade, so the last link can scroll fully clear of it. */}
        <span aria-hidden className="w-16 shrink-0 lg:hidden" />
      </div>

      {FEATURES.rsvp ? (
        <div className="flex shrink-0 justify-end lg:w-[140px] xl:w-[220px]">
          <Link
            to="/rsvp"
            className="flex h-(--jump-h) items-center bg-ink px-[18px] font-display text-xs font-semibold tracking-[0.18em] text-paper transition-opacity hover:opacity-90 lg:h-10 lg:rounded-[3px] lg:px-6 lg:text-[13px]"
          >
            RSVP
          </Link>
        </div>
      ) : (
        <span aria-hidden className="hidden w-[140px] lg:block xl:w-[220px]" />
      )}
    </nav>
  );
}

/**
 * Glides to the section rather than cutting to it, so the guest can see they
 * moved down the same page. Done here, not with `scroll-behavior: smooth` on
 * <html>, which would also animate the router's scroll on every page change.
 *
 * The address bar is left alone: the router patches `history.replaceState`, so
 * writing the hash re-runs the route and cuts the glide short. Each link keeps
 * its `#id` href, so "copy link" still gives a link to the section.
 */
function jumpTo(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  const newTab = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
  if (!target || newTab) return;
  event.preventDefault();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  target.focus({ preventScroll: true });
}

/** The section being read: the last one whose top has passed a line a third of the way down. */
function useActiveSection() {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = INFO_SECTIONS.map((section) => document.getElementById(section.id)).filter(
      (element): element is HTMLElement => element !== null,
    );
    const visible = new Set<string>();

    const update = () => {
      // The last section is too short to reach the band, so the foot of the page counts as it.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const current = atEnd ? elements.at(-1) : elements.find((element) => visible.has(element.id));
      setActive(current?.id ?? null);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        update();
      },
      // A thin band near the top: whichever section crosses it is the one being read.
      { rootMargin: "-30% 0px -69% 0px" },
    );

    for (const element of elements) observer.observe(element);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, []);

  return active;
}
