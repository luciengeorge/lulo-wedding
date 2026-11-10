import { ChartCard } from "./chart-card";
import { formatCount, plural } from "./format";

type Props = {
  plusOnes: { allowed: number; named: number; coming: number };
  dietary: readonly { name: string; note: string }[];
};

/**
 * The two things a caterer asks after the headcount. Three numbers rather than
 * a chart: plus-ones run from offered to named to coming, and the counts are
 * small enough to read at a glance. Dietary notes are listed by name, only for
 * guests who are coming, behind a disclosure so the card stays short.
 */
export function PlusOnesChart({ plusOnes, dietary }: Props) {
  const stats = [
    { label: "Allowed", value: plusOnes.allowed },
    { label: "Named", value: plusOnes.named },
    { label: "Coming", value: plusOnes.coming },
  ];

  return (
    <ChartCard
      title="Plus-ones & dietary needs"
      question="How many plus-ones were offered, named and are coming, and who needs a special meal."
      empty={
        plusOnes.allowed === 0 && plusOnes.named === 0
          ? { title: "No plus-ones offered", hint: "No invitation includes a plus-one yet." }
          : undefined
      }
      summary={
        <p>
          {plural(plusOnes.allowed, "plus-one")} allowed, {formatCount(plusOnes.named)} named,{" "}
          {formatCount(plusOnes.coming)} coming.
        </p>
      }
      table={{
        caption: "Plus-ones",
        columns: ["Step", "Plus-ones"],
        rows: stats.map((stat) => [stat.label, stat.value]),
      }}
      footer={<DietaryNotes dietary={dietary} />}
    >
      <dl aria-hidden className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 rounded-md bg-muted/50 px-3 py-3">
            <dt className="text-[12px] text-muted-foreground">{stat.label}</dt>
            <dd
              className={`text-[26px] leading-none font-semibold ${stat.value === 0 ? "text-muted-foreground/70" : "text-foreground"}`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatCount(stat.value)}
            </dd>
          </div>
        ))}
      </dl>
    </ChartCard>
  );
}

function DietaryNotes({ dietary }: { dietary: Props["dietary"] }) {
  if (dietary.length === 0) {
    return (
      <p data-slot="dietary" className="border-t border-border pt-3 text-[12.5px] text-muted-foreground">
        No dietary notes from guests who are coming yet.
      </p>
    );
  }
  return (
    <details data-slot="dietary" className="group border-t border-border pt-3 text-[12.5px]">
      <summary className="cursor-pointer text-foreground/80 marker:text-muted-foreground">
        <span className="font-medium text-foreground">{plural(dietary.length, "guest")}</span> coming with dietary notes
      </summary>
      <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
        {dietary.map((guest, index) => (
          <li key={`${guest.name}-${index}`} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{guest.name}</span>
            <span className="text-muted-foreground">{guest.note}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
