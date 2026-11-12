import type { ReactNode } from "react";

import type { ScheduleEvent, ShownFaq, ShownTravelNote } from "@/lib/functions/home-content";

import { cn } from "@/lib/utils";
import {
  AIRPORT_TAXI,
  NEARBY_HOTELS,
  PLACES,
  REGISTRY,
  ROOM_BLOCK,
  TAXI,
  telHref,
  TOURS,
  WINERIES,
} from "@/lib/wedding-info";

/**
 * The home page below the hero: one section per thing a guest needs, each
 * reachable from the jump bar by its `#id`.
 *
 * Unconfirmed details are drawn as such ("To be confirmed", in the pending
 * colour), never invented. They come from src/lib/wedding-info.ts, and the parts
 * that depend on who is looking (events, FAQ, travel notes) from the loader.
 */

function InfoSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      // Focusable so the jump bar can move keyboard focus here.
      tabIndex={-1}
      // Clear of the sticky bar when jumped to.
      className="scroll-mt-(--jump-h) px-6 pt-14 pb-2 outline-none lg:grid lg:grid-cols-[304px_1fr] lg:gap-24 lg:px-0 lg:pt-24"
    >
      <header className="flex flex-col gap-1 lg:sticky lg:top-28 lg:gap-1.5 lg:self-start">
        <p className="font-display text-xs leading-4 font-semibold tracking-caps text-faded uppercase lg:text-[13px]">
          {eyebrow}
        </p>
        <h2
          id={`${id}-title`}
          className="font-script text-[44px] leading-[52px] text-ink lg:text-[64px] lg:leading-[72px]"
        >
          {title}
        </h2>
      </header>
      <div className="mt-6 lg:mt-3">{children}</div>
    </section>
  );
}

function Pending({ children }: { children: ReactNode }) {
  return <span className="text-pending italic">{children}</span>;
}

/** Small caps heading inside a section: "SHUTTLES", "ALSO NEARBY". */
function Subhead({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-display text-xs leading-4 font-semibold tracking-[0.18em] text-ink uppercase">{children}</h3>
  );
}

const body = "font-display text-[17px] leading-[25px] text-bark";

type InfoSectionsProps = {
  events: readonly ScheduleEvent[];
  faqs: readonly ShownFaq[];
  travelNotes: readonly ShownTravelNote[];
};

export function InfoSections({ events, faqs, travelNotes }: InfoSectionsProps) {
  return (
    <div className="mx-auto w-full max-w-[1136px] lg:px-12">
      <Schedule events={events} />
      <Travel events={events} notes={travelNotes} />
      <Stay />
      <Faq faqs={faqs} />
      <Discover />
      <Registry />
    </div>
  );
}

function Schedule({ events }: { events: readonly ScheduleEvent[] }) {
  return (
    <InfoSection id="schedule" eyebrow="Schedule · July 2027" title={events.length > 1 ? "The weekend" : "The day"}>
      <ol className="-mt-7 flex flex-col">
        {events.map((event) => (
          <EventRow key={event.key} event={event} />
        ))}
      </ol>
    </InfoSection>
  );
}

/** Marks a detail that is only for some events, such as "Brunch". */
function OnlyFor({ label }: { label: string | null }) {
  if (!label) return null;
  return (
    <p className="font-display text-[11px] leading-4 font-semibold tracking-[0.18em] text-faded uppercase">{label}</p>
  );
}

const names = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** Where each event sits around the wedding, which is how the planner wants guests to read the weekend. */
const DAY_LABEL: Record<ScheduleEvent["key"], string> = {
  preWedding: "Two days before",
  wedding: "The day",
  brunch: "The day after",
};

/**
 * One day on the timeline. The wedding is always open and set in red, so it reads
 * first even though the days stay in date order; the others fold to one line that
 * still says where and when, so nobody stops at the 17th thinking that is all.
 */
function EventRow({ event }: { event: ScheduleEvent }) {
  const main = event.key === "wedding";

  const date = (
    <div aria-hidden className="flex w-14 shrink-0 flex-col items-center pt-0.5">
      <span
        className={cn(
          "font-display leading-none font-semibold",
          main ? "text-[40px] text-ink" : "text-[30px] text-bark",
        )}
      >
        {event.day}
      </span>
      <span
        className={cn(
          "pt-1.5 font-display text-[11px] leading-[14px] font-semibold tracking-[0.18em] uppercase",
          main ? "text-ink" : "text-faded",
        )}
      >
        {event.weekday.slice(0, 3)}
      </span>
    </div>
  );

  const heading = (
    <div className="flex flex-col gap-0.5">
      <p className="font-display text-[11px] leading-4 font-semibold tracking-[0.18em] text-faded uppercase">
        {DAY_LABEL[event.key]}
      </p>
      <h3
        className={cn("font-display font-medium text-bark", main ? "text-[24px] leading-8" : "text-[20px] leading-7")}
      >
        <span className="sr-only">
          {event.weekday} {event.day} July:{" "}
        </span>
        {event.name}
      </h3>
      {event.for.length > 0 ? (
        <p className="font-display text-base leading-[22px] text-faded italic">For {names.format(event.for)}</p>
      ) : null}
    </div>
  );

  if (main) {
    return (
      <li className="flex gap-[18px] border-b border-rule py-7">
        {date}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {heading}
          <EventDetails event={event} />
        </div>
      </li>
    );
  }

  return (
    <li className="border-b border-rule">
      <details className="group">
        <summary className="flex cursor-pointer list-none gap-[18px] py-6 [&::-webkit-details-marker]:hidden">
          {date}
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              {heading}
              <p className="font-display text-base leading-[22px] text-faded group-open:hidden">{oneLine(event)}</p>
            </div>
            <span
              aria-hidden
              className="mt-5 inline-block font-display text-[22px] leading-none text-ink group-open:rotate-45 motion-safe:transition-transform"
            >
              +
            </span>
          </div>
        </summary>
        <div className="-mt-3 flex flex-col gap-3 pb-7 pl-[74px]">
          <EventDetails event={event} />
        </div>
      </details>
    </li>
  );
}

/** The folded line: what is known, or that nothing is yet. */
function oneLine(event: ScheduleEvent): string {
  const known = [event.venue ?? event.area, event.time, event.dress].filter(Boolean);
  return known.length > 0 ? known.join(" · ") : "Place, time and dress code to come";
}

function EventDetails({ event }: { event: ScheduleEvent }) {
  const nothingYet = !event.area && !event.venue && !event.time && !event.dress && !event.shuttle;

  return (
    <>
      {nothingYet ? (
        <p className="font-display text-base leading-[22px]">
          <Pending>Place, time and dress code to come.</Pending>
        </p>
      ) : (
        <dl className="grid grid-cols-[60px_1fr] gap-x-2.5 gap-y-2 font-display text-base leading-[22px] text-bark">
          <Fact label="Where">
            {event.venue ? (
              [event.venue, event.area].filter(Boolean).join(", ")
            ) : event.area ? (
              <>
                {event.area}, <Pending>venue to be confirmed</Pending>
              </>
            ) : (
              <Pending>To be confirmed</Pending>
            )}
          </Fact>
          <Fact label="Time">{event.time ?? <Pending>To be confirmed</Pending>}</Fact>
          <Fact label="Dress">{event.dress ?? <Pending>To be confirmed</Pending>}</Fact>
          {event.shuttle ? (
            <Fact label="Travel">
              Shuttle from {event.shuttle.from}
              {event.shuttle.time ? (
                ` at ${event.shuttle.time}`
              ) : (
                <>
                  , <Pending>time to be confirmed</Pending>
                </>
              )}
            </Fact>
          ) : null}
        </dl>
      )}

      {event.goodToKnow ? (
        <div className="flex flex-col gap-1 rounded-[3px] bg-paper-deep px-4 py-3.5">
          <p className="font-display text-[11px] leading-4 font-semibold tracking-[0.18em] text-ink uppercase">
            Good to know
          </p>
          <p className="font-display text-base leading-[22px] text-bark">{event.goodToKnow}</p>
        </div>
      ) : null}

      {event.calendar ? (
        <a
          href="/api/calendar/wedding"
          className="mt-1 flex items-center gap-2 self-start font-display text-xs leading-4 font-semibold tracking-[0.16em] text-ink"
        >
          <svg aria-hidden width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <rect x="1.5" y="2.5" width="11" height="10" rx="1" stroke="currentColor" />
            <path d="M1.5 5.5h11M4.5 1v3M9.5 1v3" stroke="currentColor" />
          </svg>
          <span className="border-b border-amber pb-0.5">ADD TO CALENDAR</span>
        </a>
      ) : null}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-px text-[11px] leading-5 font-semibold tracking-[0.16em] text-faded uppercase">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/** A labelled block in a list of them, ruled off from the next. */
function Item({
  title,
  onlyFor = null,
  children,
  className,
}: {
  title: string;
  onlyFor?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 border-t border-rule py-[18px]", className)}>
      <OnlyFor label={onlyFor} />
      <Subhead>{title}</Subhead>
      {children}
    </div>
  );
}

function Travel({ events, notes }: { events: readonly ScheduleEvent[]; notes: readonly ShownTravelNote[] }) {
  const withShuttle = events.filter((event) => event.shuttle);
  const onlyWedding = withShuttle.length === 1 && withShuttle[0]?.key === "wedding";

  return (
    <InfoSection id="travel" eyebrow="Travel" title="Getting there">
      <p className="font-display text-lg leading-[27px] text-bark">
        Faraya is about an hour to an hour and a half from Beirut by car. Summer weekends get busy on the mountain
        roads, so leave a little extra time on the day.
      </p>

      <div className="mt-[26px] flex flex-col border-b border-rule">
        {withShuttle.length > 0 ? (
          <Item title="Shuttles">
            {onlyWedding && withShuttle[0]?.shuttle ? (
              <p className={body}>
                We have arranged shuttles between {withShuttle[0].shuttle.from} and the wedding.{" "}
                {withShuttle[0].shuttle.time ? (
                  `They leave at ${withShuttle[0].shuttle.time}.`
                ) : (
                  <Pending>Times to be confirmed.</Pending>
                )}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {withShuttle.map((event) =>
                  event.shuttle ? (
                    <li key={event.key} className={body}>
                      {event.name}: from {event.shuttle.from}
                      {event.shuttle.time ? (
                        ` at ${event.shuttle.time}`
                      ) : (
                        <>
                          , <Pending>time to be confirmed</Pending>
                        </>
                      )}
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </Item>
        ) : null}
        <Item title="From the airport">
          <p className={body}>
            Book your ride from Beirut airport on the {AIRPORT_TAXI.name} app. It is safe, and they know we have guests
            arriving.{" "}
            {AIRPORT_TAXI.code ? (
              <>
                Use the code <span className="font-semibold">{AIRPORT_TAXI.code}</span> for a discount.
              </>
            ) : (
              <Pending>Discount code to come.</Pending>
            )}
          </p>
        </Item>
        <Item title="Taxi">
          <p className={body}>{TAXI.name}, any of these numbers:</p>
          <ul className="flex flex-col gap-1 pt-0.5">
            {TAXI.numbers.map((number) => (
              <li key={number}>
                <a
                  href={telHref(number)}
                  className="font-display text-[17px] leading-[26px] text-ink underline decoration-amber underline-offset-4"
                >
                  {number}
                </a>
              </li>
            ))}
          </ul>
        </Item>
        {notes.map((note) => (
          <Item key={note.title} title={note.title} onlyFor={note.onlyFor}>
            <p className={body}>{note.pending ? <Pending>{note.text}</Pending> : note.text}</p>
          </Item>
        ))}
      </div>
    </InfoSection>
  );
}

function Stay() {
  return (
    <InfoSection id="stay" eyebrow="Stay" title="Where to stay">
      <div className="flex flex-col gap-2.5">
        <h3 className="font-display text-[26px] leading-8 font-medium text-bark">{ROOM_BLOCK.hotel}</h3>
        <p className={body}>We have arranged special rates for our guests. The wedding shuttles leave from here.</p>
      </div>

      <ul className="mt-4 flex flex-col border-b border-rule">
        {ROOM_BLOCK.rooms.map((room) => (
          <li key={room.name} className="flex items-baseline gap-3 border-t border-rule py-3">
            <span className="flex-1 font-display text-[17px] leading-6 text-bark">{room.name}</span>
            <span className="shrink-0 text-right font-display text-[15px] leading-6">
              {room.rate ?? <Pending>Rate to come</Pending>}
            </span>
          </li>
        ))}
      </ul>

      {ROOM_BLOCK.booking ? (
        <a
          href={ROOM_BLOCK.booking.href}
          className="mt-4 flex h-[52px] items-center justify-center rounded-[3px] bg-ink font-display text-[15px] font-semibold tracking-[0.16em] text-paper uppercase"
        >
          {ROOM_BLOCK.booking.label}
        </a>
      ) : (
        <p className="mt-4 flex h-[50px] items-center justify-center rounded-[3px] border border-dashed border-pending/40 font-display text-[13px] font-semibold tracking-[0.16em] text-pending">
          BOOKING DETAILS TO COME
        </p>
      )}

      <div className="mt-8 flex flex-col gap-3">
        <Subhead>Also nearby</Subhead>
        <p className={body}>If you would rather look around, these are close by.</p>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 pt-1 lg:grid-cols-3">
          {NEARBY_HOTELS.map((hotel) => (
            <li key={hotel} className="font-display text-[17px] leading-6 text-bark">
              {hotel}
            </li>
          ))}
        </ul>
      </div>
    </InfoSection>
  );
}

function Faq({ faqs }: { faqs: readonly ShownFaq[] }) {
  return (
    <InfoSection id="faq" eyebrow="FAQ" title="Good to know">
      <div className="flex flex-col gap-7">
        {faqs.map((faq) => (
          <div key={faq.question} className="flex flex-col gap-2">
            <OnlyFor label={faq.onlyFor} />
            <h3 className="font-display text-[19px] leading-[26px] font-semibold text-bark">{faq.question}</h3>
            <p className={body}>{faq.answer}</p>
          </div>
        ))}
      </div>
    </InfoSection>
  );
}

function PlaceHeader({ name, kind }: { name: string; kind: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="font-display text-2xl leading-[30px] font-medium text-bark">{name}</h3>
      <span className="shrink-0 font-display text-[11px] leading-4 font-semibold tracking-[0.18em] text-faded uppercase">
        {kind}
      </span>
    </div>
  );
}

function Discover() {
  return (
    <InfoSection id="discover" eyebrow="Discover" title="Lebanon">
      <p className="font-display text-lg leading-[27px] text-faded italic">
        If you are making a trip of it, a few places worth the drive.
      </p>
      <p className={cn(body, "mt-4")}>
        Lebanon has a lot to offer, from its history to its wineries. To book a day tour with a guide,{" "}
        {TOURS.contact ? `contact ${TOURS.contact}.` : <Pending>contact details to come.</Pending>}
      </p>

      <div className="mt-[26px] flex flex-col border-b border-rule">
        {PLACES.map((place) => (
          <article key={place.name} className="flex flex-col gap-2 border-t border-rule py-[22px]">
            <PlaceHeader name={place.name} kind={place.kind} />
            <p className={body}>{place.text}</p>
          </article>
        ))}
        <article className="flex flex-col gap-2 border-t border-rule py-[22px]">
          <PlaceHeader name="Wineries" kind="The vineyards" />
          <p className={body}>Good wine and long views. Don&apos;t miss:</p>
          <ul className="flex flex-col gap-1.5 pt-1">
            {WINERIES.map((winery) => (
              <li key={winery.name} className="flex items-baseline gap-3">
                <span className="w-[170px] shrink-0 font-display text-[17px] leading-6 text-bark">{winery.name}</span>
                <span className="font-display text-[15px] leading-6 text-faded italic">{winery.town}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </InfoSection>
  );
}

function Registry() {
  return (
    <InfoSection id="registry" eyebrow="Registry" title="Gifts">
      <div className="flex flex-col">
        {REGISTRY.map((option) => (
          <Item key={option.title} title={option.title}>
            <p className={body}>
              {option.text} {option.detail ?? <Pending>Details to come.</Pending>}
            </p>
          </Item>
        ))}
      </div>
    </InfoSection>
  );
}
