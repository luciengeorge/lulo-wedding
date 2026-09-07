import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import type { ParsedParty } from "@/lib/guest-csv";

import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { convexErrorMessage } from "@/lib/convex-error";
import { GuestCsvError, parseGuestCsv } from "@/lib/guest-csv";

type ImportReport = {
  created: number;
  updated: number;
  unchanged: number;
  missingFromCsv: { importKey: string; displayName: string }[];
  warnings: string[];
};

type Stage =
  | { step: "pick" }
  | { step: "parsing" }
  | { step: "failed"; problems: string[] }
  | { step: "preview"; rows: ParsedParty[]; parseWarnings: string[]; report: ImportReport }
  | { step: "applying"; rows: ParsedParty[] }
  | { step: "done"; report: ImportReport };

/**
 * Re-imports the couple's exported guest sheet.
 *
 * The file is parsed in the browser with the same parser the CLI import uses,
 * then run through `importParties` as a dry run so the couple see the exact
 * created/updated/unchanged/missing report *before* anything is written. Only
 * the confirm click writes.
 */
export function ImportCsvDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[560px]">
        <ImportCsvBody onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvBody({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState<Stage>({ step: "pick" });
  const importParties = useMutation(api.parties.importParties);

  const handleFile = async (file: File) => {
    setStage({ step: "parsing" });

    let rows: ParsedParty[];
    let parseWarnings: string[];
    try {
      const parsed = parseGuestCsv(await file.text());
      rows = parsed.rows;
      parseWarnings = parsed.warnings;
    } catch (error) {
      setStage({
        step: "failed",
        problems:
          error instanceof GuestCsvError
            ? [...error.problems]
            : [convexErrorMessage(error, "Could not read that file")],
      });
      return;
    }

    try {
      const report = await importParties({ rows, dryRun: true });
      setStage({ step: "preview", rows, parseWarnings, report });
    } catch (error) {
      setStage({ step: "failed", problems: [convexErrorMessage(error, "Could not read that file")] });
    }
  };

  const handleApply = async (rows: ParsedParty[]) => {
    setStage({ step: "applying", rows });
    try {
      const report = await importParties({ rows });
      toast.success(`Imported ${rows.length} parties`, {
        description: `${report.created} created, ${report.updated} updated, ${report.unchanged} unchanged.`,
      });
      setStage({ step: "done", report });
    } catch (error) {
      setStage({
        step: "failed",
        problems: [convexErrorMessage(error, "The import failed")],
      });
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import the guest sheet</DialogTitle>
        <DialogDescription>
          Export the sheet as CSV and drop it in. Matching is on name and surname, so existing parties keep their magic
          link and their invite flags. Nothing is ever deleted.
        </DialogDescription>
      </DialogHeader>

      {stage.step === "pick" || stage.step === "parsing" ? (
        <div className="flex flex-col gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={stage.step === "parsing"}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
            className="text-[12.5px] text-[#52525B] file:mr-3 file:rounded-md file:border file:border-[#E4E4E7] file:bg-white file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium hover:file:bg-[#FAFAFA]"
          />
          {stage.step === "parsing" ? (
            <p className="flex items-center gap-2 text-[12.5px] text-[#71717A]">
              <Spinner /> Checking the file
            </p>
          ) : null}
        </div>
      ) : null}

      {stage.step === "failed" ? (
        <div className="flex flex-col gap-2 rounded-md border border-[#FECDD3] bg-[#FFF1F2] p-3">
          <p className="text-[12.5px] font-medium text-[#9F1239]">This file was not imported</p>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-[12px] text-[#9F1239]">
            {stage.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {stage.step === "preview" || stage.step === "applying" || stage.step === "done" ? (
        <ReportPanel
          report={stage.step === "applying" ? null : stage.report}
          parseWarnings={stage.step === "preview" ? stage.parseWarnings : []}
          rowCount={stage.step === "done" ? undefined : stage.rows.length}
          applied={stage.step === "done"}
        />
      ) : null}

      <DialogFooter>
        {stage.step === "preview" ? (
          <>
            <Button type="button" variant="outline" onClick={() => setStage({ step: "pick" })}>
              Choose another file
            </Button>
            <Button type="button" className="bg-ink hover:bg-ink/90" onClick={() => void handleApply(stage.rows)}>
              Apply import
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={onDone}>
            {stage.step === "done" ? "Done" : "Cancel"}
          </Button>
        )}
        {stage.step === "applying" ? (
          <Button type="button" disabled className="bg-ink">
            <Spinner /> Importing
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

function ReportPanel({
  report,
  parseWarnings,
  rowCount,
  applied,
}: {
  report: ImportReport | null;
  parseWarnings: string[];
  rowCount?: number;
  applied: boolean;
}) {
  if (!report) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-[#71717A]">
        <Spinner /> Writing {rowCount} parties
      </p>
    );
  }

  const warnings = [...parseWarnings, ...report.warnings];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-[#52525B]">
        {applied
          ? "Imported."
          : `${rowCount} parties read from the file. Nothing has been written yet — this is what applying it would do.`}
      </p>

      <div className="grid grid-cols-4 gap-3 rounded-md border border-[#E4E4E7] p-3">
        <ReportStat label="Created" value={report.created} />
        <ReportStat label="Updated" value={report.updated} />
        <ReportStat label="Unchanged" value={report.unchanged} />
        <ReportStat label="Not in file" value={report.missingFromCsv.length} />
      </div>

      {report.missingFromCsv.length > 0 ? (
        <details className="rounded-md border border-[#E4E4E7] p-3">
          <summary className="cursor-pointer text-[12.5px] font-medium">
            {report.missingFromCsv.length} parties are in the database but not in this file
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[12px] text-[#71717A]">
            {report.missingFromCsv.map((party) => (
              <li key={party.importKey}>{party.displayName}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {warnings.length > 0 ? (
        <details className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] p-3">
          <summary className="cursor-pointer text-[12.5px] font-medium text-[#92400E]">
            {warnings.length} warning(s)
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-[12px] text-[#92400E]">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#71717A]">{label}</span>
      <span
        className={`text-[19px] font-semibold ${value === 0 ? "text-[#A1A1AA]" : ""}`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
    </div>
  );
}
