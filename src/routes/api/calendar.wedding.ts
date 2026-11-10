import { createFileRoute } from "@tanstack/react-router";

import { SITE_URL } from "@/lib/seo";
import { WEDDING_EVENTS } from "@/lib/wedding-details.server";

/**
 * The wedding as a calendar file, for "Add to calendar".
 *
 * Served rather than built in the browser: iOS only offers to add a `.ics` to
 * the calendar when it arrives as a real `text/calendar` response, not as a
 * data URL. All-day until the ceremony time is confirmed.
 */
export const Route = createFileRoute("/api/calendar/wedding")({
  server: {
    handlers: {
      GET: async () => {
        const wedding = WEDDING_EVENTS.find((event) => event.key === "wedding");
        const day = String(wedding?.day ?? 17).padStart(2, "0");
        const next = String((wedding?.day ?? 17) + 1).padStart(2, "0");
        const location = [wedding?.venue, wedding?.area, "Lebanon"].filter(Boolean).join(", ");

        const ics = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//lauralucien.com//Wedding//EN",
          "CALSCALE:GREGORIAN",
          "BEGIN:VEVENT",
          "UID:wedding-20270717@lauralucien.com",
          "DTSTAMP:20261109T000000Z",
          `DTSTART;VALUE=DATE:202707${day}`,
          `DTEND;VALUE=DATE:202707${next}`,
          "SUMMARY:Laura and Lucien's wedding",
          `LOCATION:${location.replace(/,/g, "\\,")}`,
          `DESCRIPTION:Times and details: ${SITE_URL}/#schedule`,
          `URL:${SITE_URL}/#schedule`,
          "END:VEVENT",
          "END:VCALENDAR",
          "",
        ].join("\r\n");

        return new Response(ics, {
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            // Inline, not attachment: with attachment iOS saves it to Files instead of offering the calendar.
            "Content-Disposition": 'inline; filename="laura-and-lucien.ics"',
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
