import { existsSync, readdirSync } from "node:fs";
import { openCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// The real IE syllabi live in syllabi-test/ (never committed): these tests skip without them.
const DIR = "syllabi-test";
const PDFS = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];

const EXPECTED: Record<string, string[]> = {
  "STRATEGIES FOR COMPETING IN INDUSTRIES AND MARKETS": ["Final Exam", "Intermediate tests", "Group Presentation", "Class Participation"],
  "DATA ANALYSIS FOR ECONOMICS": ["Class Participation", "Intermediate Tests", "Applied Work", "Final Exam"],
  "HUMAN CAPITAL MANAGEMENT": ["Final Exam", "Group Presentation", "Class Participation", "Intermediate tests"],
  "MANAGEMENT CONTROL": ["Final Exam", "Class Participation", "Intermediate Tests", "Assignments", "Assignment #1", "Assignment #2"],
  "SUPPLY CHAIN MANAGEMENT": ["Final Exam", "Group Work", "Individual Work", "Class Participation"],
};

test.describe("syllabus import", () => {
  test.skip(PDFS.length === 0, "no syllabi in syllabi-test/");

  for (const file of PDFS) {
    test(`new course from ${file}`, async ({ page }) => {
      await page.goto("/app");
      const chooser = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Import syllabus PDF" }).first().click();
      await (await chooser).setFiles(`${DIR}/${file}`);
      const review = page.getByRole("region", { name: "Check what we read from your syllabus" });
      await expect(review).toBeVisible({ timeout: 20_000 });
      const courseName = await review.getByLabel("Course name").inputValue();
      const expected = EXPECTED[courseName];
      expect(expected, courseName).toBeDefined();
      // A unique name so reruns on the same account don't collide.
      const name = uniqueName(courseName);
      await review.getByLabel("Course name").fill(name);
      await review.getByRole("button", { name: "Create course" }).click();

      const card = page.getByTestId("core-item").filter({ hasText: name });
      // Several requests to Supabase: allow for a slow network.
      await expect(card.getByRole("button", { name: new RegExp(name) }).first()).toHaveAttribute("aria-expanded", "true", { timeout: 30_000 });
      await expect(card.getByText("Weights: 100%")).toBeVisible();
      for (const row of expected) await expect(card.getByTestId("assessment-row").filter({ hasText: row }).first()).toBeVisible();
      // Every row without parts can take a grade.
      const add = card.getByRole("button", { name: /^Add grade for / });
      expect(await add.count()).toBeGreaterThanOrEqual(3);
      await add.first().click();
      await page.keyboard.type("7,5");
      await page.keyboard.press("Enter");
      await expect(card.getByRole("button", { name: /^Edit grade for / })).toHaveCount(1);
    });
  }

  test("fill an existing empty course, and cancel", async ({ page }) => {
    const name = uniqueName("Fill");
    await page.goto("/app");
    await page.getByTestId("core-input").fill(name);
    await page.getByTestId("core-submit").click();
    const card = await openCourse(page, name);

    // Cancel first: nothing saved.
    let chooser = page.waitForEvent("filechooser");
    await card.getByRole("button", { name: "Import syllabus PDF" }).click();
    await (await chooser).setFiles(`${DIR}/${PDFS[0]}`);
    await expect(card.getByRole("region", { name: "Check what we read from your syllabus" })).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: "Cancel" }).click();
    await expect(card.getByText("No assessments yet")).toBeVisible();

    chooser = page.waitForEvent("filechooser");
    await card.getByRole("button", { name: "Import syllabus PDF" }).click();
    await (await chooser).setFiles(`${DIR}/${PDFS[0]}`);
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByText("Weights: 100%")).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("core-item").filter({ hasText: name })).toHaveCount(1);
  });

  test("a PDF that isn't a syllabus shows a clear message", async ({ page }, info) => {
    const path = info.outputPath("not-a-syllabus.pdf");
    // A minimal valid one-page PDF with no evaluation table.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(
      path,
      "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
    );
    await page.goto("/app");
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import syllabus PDF" }).first().click();
    await (await chooser).setFiles(path);
    await expect(page.getByText(/couldn't read/i).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Cancel" }).first().click();
  });
});
