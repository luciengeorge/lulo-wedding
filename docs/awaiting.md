# Awaiting Laura and Lucien

Everything the site needs that only the couple can supply. Anything here that is
still open is either stubbed, flag-gated, or drawn with a clearly-marked
placeholder, never invented and left to look real.

Update this file whenever an item lands or a new one is promised. Date every
answer so a stale placeholder is obvious.

## Open

| # | Item | Needed by | Placeholder in use | Asked |
|---|------|-----------|--------------------|-------|
| 1 | **RSVP deadline** | RSVP screens, confirmation email, server-side cutoff (`RSVP_DEADLINE`) | "1 June 2027" throughout the Paper designs | 2026-09-08, "not set yet, will get back to you" |
| 2 | **Wedding venue** name and address (17/07) | Details page, confirmation email, map link | none, section not built | 2026-09-07 |
| 3 | **Pre-wedding venue** name and address (15/07) | Details page | none | 2026-09-07 |
| 4 | **Brunch venue** name and address (18/07) | Details page | none | 2026-09-07 |
| 5 | **Start times** for all three events | Details page, RSVP event list, calendar links | dates only, no times shown | 2026-09-07 |
| 6 | **Dress code** per event | Details page | none | 2026-09-07 |
| 7 | **Pre-wedding invite list** | `invitedToPreWedding` on 400 parties | all false; couple set it by hand in /admin using bulk actions | 2026-09-08, decided: set by hand |
| 8 | **Brunch invite list** | `invitedToBrunch` on 400 parties | all false; same | 2026-09-08, decided: set by hand |
| 9 | **Hotels**: names, nightly rates, booking links, any room-block codes | Hotels page | none, page not built | 2026-09-07 |
| 10 | **Travel**: airport, transfer options, whether shuttles are laid on | Travel page | none | 2026-09-07 |
| 11 | **Visa guidance** for non-Lebanese guests | Travel page | none | 2026-09-07 |
| 12 | **Things to do in Lebanon** | Things-to-do page | none | 2026-09-07 |
| 13 | **FAQ** content | FAQ section | none | 2026-09-07 |
| 14 | **Registry** details | Registry section, agreed to include | none | 2026-09-07 |
| 15 | **Six placeholder parties** in the sheet need real names | Guest list correctness | imported as-is | 2026-09-07, flagged not actioned |

Item 15, the exact rows: `Lucy` and `Pascale & Biche` have blank surnames;
`Noura & Jad` and `Celine & Jack` have `??` as the surname; `Dominique & Elias?`
and `? & Wasim` carry a literal question mark in the name.

## Answered

| Item | Answer | Date |
|------|--------|------|
| Domain | `lauralucien.com`, bought | 2026-09-07 |
| Is the save-the-date public? | No, it sits behind the guest password too | 2026-09-07 |
| Collect guest emails? | Yes, at RSVP | 2026-09-07 |
| `Engagement` column | Ignore it; pre-wedding list set by hand in admin instead | 2026-09-08 |
| `<50?` column | Under 50 years old, worth keeping | 2026-09-07 |
| Notes | Party-level `note` plus a guest-level `dietaryNotes` | 2026-09-07 |
| Does declining require an email? | Yes, required | 2026-09-08 |
| One RSVP submission per party, or several? | Flexible: a party may answer for some seats and come back for the rest | 2026-09-08 |
| Email sending | Resend, from a subdomain; DMARC record added | 2026-09-08 |
| Admin edits vs CSV re-import | Admin wins; `editedInAdminAt` detaches the row from the importer | 2026-09-07 |
