import { REPORTED_COURSE, openCourse, seedCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// Bug 1: every assessment is its own row; clicking a row never hides or shows another row.
// The course is the one from the report (MANAGEMENT CONTROL after a syllabus import).

const ROWS = ["Final Exam", "Class Participation", "Intermediate Tests", "Assignments", "Assignment #1", "Assignment #2"];

test.describe("course rows are independent", () => {
  test("parts are sibling rows, not nested inside their parent", async ({ page, account }) => {
    const name = uniqueName("Rows");
    await seedCourse(account.db, name, REPORTED_COURSE);
    await page.goto("/app");
    const card = await openCourse(page, name);
    for (const row of ROWS) await expect(card.getByTestId("assessment-row").filter({ hasText: row }).first()).toBeVisible();

    const nested = await card.evaluate((el) =>
      [...el.querySelectorAll('[data-testid="assessment-row"]')].filter((r) =>
        r.parentElement?.closest('[data-testid="assessment-row"]'),
      ).length,
    );
    expect(nested).toBe(0);
    await expect(card.getByTestId("assessment-row")).toHaveCount(ROWS.length);
  });

  test("clicking any row never hides another row", async ({ page, account }) => {
    const name = uniqueName("Rows");
    await seedCourse(account.db, name, REPORTED_COURSE);
    await page.goto("/app");
    const card = await openCourse(page, name);
    const row = (n: string) => card.getByTestId("assessment-row").filter({ has: page.getByText(n, { exact: true }) });

    for (const clicked of ["Final Exam", "Class Participation", "Intermediate Tests", "Assignment #1"]) {
      // Click the row itself (its name), twice, like the report.
      for (let i = 0; i < 2; i++) {
        await row(clicked).getByText(clicked, { exact: true }).click();
        for (const other of ROWS) await expect(row(other), `${other} after clicking ${clicked}`).toBeVisible();
      }
    }
  });

  test("only a parent with parts has a toggle, and it toggles only its own parts", async ({ page, account }) => {
    const name = uniqueName("Rows");
    await seedCourse(account.db, name, [
      ...REPORTED_COURSE.slice(0, 2),
      { name: "Intermediate Tests", weight: 25, best_of: 2, parts: [{ name: "Test 1", weight: 12.5 }, { name: "Test 2", weight: 12.5 }, { name: "Test 3", weight: 12.5 }] },
      REPORTED_COURSE[3],
    ]);
    await page.goto("/app");
    const card = await openCourse(page, name);
    const toggles = card.locator("[data-testid=assessment-row] button[aria-expanded][aria-controls]:not([aria-haspopup])");
    await expect(toggles).toHaveCount(2);

    const tests = toggles.filter({ hasText: "Intermediate Tests" });
    const assignments = toggles.filter({ hasText: "Assignments" });
    // Parts start visible so every part can get a grade straight away.
    await expect(tests).toHaveAttribute("aria-expanded", "true");
    await expect(assignments).toHaveAttribute("aria-expanded", "true");

    await tests.click();
    await expect(card.getByText("Test 1", { exact: true })).toBeHidden();
    for (const n of ["Final Exam", "Class Participation", "Assignments", "Assignment #1", "Assignment #2"])
      await expect(card.getByText(n, { exact: true })).toBeVisible();

    await assignments.click();
    await expect(card.getByText("Assignment #1", { exact: true })).toBeHidden();
    await expect(card.getByText("Intermediate Tests", { exact: true })).toBeVisible();

    await tests.click();
    await expect(card.getByText("Test 1", { exact: true })).toBeVisible();
    await expect(card.getByText("Assignment #1", { exact: true })).toBeHidden();
  });
});
