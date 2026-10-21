import { GUEST_STATE, test } from "../../fixtures";
import { PAIRWISE_CASES, runFormCase, seedCases } from "./form-cases";

/** A pairwise spread of the form matrix, for the phone projects. */
test.use({ storageState: GUEST_STATE, resetPerTest: false });

test.beforeAll(() => seedCases(PAIRWISE_CASES));

for (const formCase of PAIRWISE_CASES) {
  test(`form: ${formCase.name}, ${formCase.pattern} reply`, async ({ page }) => {
    await runFormCase(page, formCase);
  });
}
