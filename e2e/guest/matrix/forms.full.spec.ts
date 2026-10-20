import { GUEST_STATE, test } from "../../fixtures";
import { FORM_CASES, runFormCase, seedCases } from "./form-cases";

/** The whole form-shape matrix. Desktop only; the phones run forms.pairwise.spec.ts. */
test.use({ storageState: GUEST_STATE, resetPerTest: false });

test.beforeAll(() => seedCases(FORM_CASES));

for (const formCase of FORM_CASES) {
  test(`form: ${formCase.name}, ${formCase.pattern} reply`, async ({ page }) => {
    await runFormCase(page, formCase);
  });
}
