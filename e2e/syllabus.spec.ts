import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// Syllabus import, the main way to add courses. The real IE syllabi live in syllabi-test/ (never
// committed): these tests skip without them. The worker's account starts each test with no courses.
const DIR = "syllabi-test";
const PDFS = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];
const MC = PDFS.find((f) => f.includes("enR9w")); // Management Control: 25 sessions, 5 ECTS

test.skip(PDFS.length === 0, "no syllabi in syllabi-test/");
test.beforeEach(async ({ account }) => {
  const { error } = await account.db.from("courses").delete().not("id", "is", null);
  if (error) throw error;
});

/** True once supabase/add-syllabus-info.sql has been run (the extra facts are stored). */
async function storesInfo(db: SupabaseClient) {
  const { error } = await db.from("courses").select("syllabus_info").limit(1);
  return !error;
}

const panel = (page: Page) => page.getByRole("dialog", { name: /^(Your courses?|Syllabus for)/ });
const cards = (page: Page) => panel(page).getByRole("article");
const READ = { timeout: 50_000 };

test("one PDF: a summary to check, then Add 1 course (2 clicks), the course opens with a hint", async ({ page }) => {
  await page.goto("/app");
  await page.evaluate(() => localStorage.clear());
  // The grading contract's form stays visible next to the import.
  await expect(page.getByTestId("core-input")).toBeVisible();
  await expect(page.getByTestId("core-submit")).toBeVisible();

  await page.getByTestId("syllabus-files").setInputFiles(`${DIR}/${MC}`);
  const add = panel(page).getByRole("button", { name: "Add 1 course" });
  await expect(add).toBeEnabled(READ);
  const card = cards(page).first();
  await expect(card.getByRole("heading", { name: "Management Control" })).toBeVisible();
  await expect(card).toContainText("5 ECTS · 25 sessions · 26/27 · 1st semester · English");
  await expect(card).toContainText("Max absences: 5 of 25 · Re-sit max 8.0 · Midterm session 14 · Final session 25");
  await expect(card).toContainText("Weights add up to 100% ✓");
  const list = card.getByRole("list", { name: "Assessments of Management Control" });
  await expect(list).toContainText("Final Exam");
  await expect(list).toContainText("40% · min 4.5");
  await expect(list).toContainText("Assignment #1");
  // A summary, not a form.
  await expect(card.getByRole("textbox")).toHaveCount(0);
  // The main action is always on screen, without scrolling.
  const box = await add.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(panel(page)).not.toContainText("@");

  await add.click();
  await expect(panel(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "Management Control added" })).toBeVisible();
  const course = page.getByTestId("core-item").filter({ hasText: "Management Control" });
  await expect(course.getByRole("button", { name: /Management Control/ }).first()).toHaveAttribute("aria-expanded", "true");
  const hint = course.getByRole("note");
  await expect(hint).toContainText("Tip: when you get a grade, tap Add grade. PassMark updates what you need and your GPA.");
  // The page shows the course from its top; the hint sits right under the first "Add grade".
  await expect(course.getByRole("button", { name: /Management Control/ }).first()).toBeInViewport();
  await hint.scrollIntoViewIfNeeded();
  // The getting-started checklist ticked step 1.
  await expect(page.getByRole("region", { name: "Getting started" })).toContainText("Import a syllabus (done)");

  // Add a grade in 2 clicks (+ typing): Add grade, type, Save.
  await course.getByRole("button", { name: "Add grade for Intermediate Tests" }).click();
  await page.keyboard.type("7,5");
  await course.getByRole("button", { name: "Save", exact: true }).click();
  await expect(course.getByRole("button", { name: "Edit grade for Intermediate Tests" })).toBeVisible();
  await expect(hint).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Getting started" })).toContainText("Add your first grade (done)");
  await page.reload();
  // The hint is one-time.
  await expect(page.getByRole("note")).toHaveCount(0);
});

test("a whole semester at once: Add 5 courses", async ({ page, account }) => {
  await page.goto("/app");
  await page.getByTestId("syllabus-files").setInputFiles(PDFS.map((f) => `${DIR}/${f}`));
  const add = panel(page).getByRole("button", { name: `Add ${PDFS.length} courses` });
  await expect(add).toBeEnabled(READ);
  await expect(cards(page)).toHaveCount(PDFS.length);
  for (const card of await cards(page).all()) await expect(card).toContainText("Weights add up to 100% ✓");
  await add.click();
  await expect(panel(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: `${PDFS.length} courses added` })).toBeVisible();
  await expect(page.getByTestId("core-item")).toHaveCount(PDFS.length);
  await page.reload();
  await expect(page.getByTestId("core-item")).toHaveCount(PDFS.length);

  const course = await openCourse(page, "Management Control");
  await expect(course.getByText("Weights: 100%")).toBeVisible();
  await expect(course.getByRole("button", { name: "Add grade for Assignment #1" })).toBeVisible();
  await expect(course).toContainText("5 ECTS");
  if (await storesInfo(account.db)) {
    const facts = course.getByRole("region", { name: "Course details" });
    await expect(facts).toContainText("26/27 · 1st semester");
    await expect(facts).toContainText("5 of 25 sessions");
    await expect(facts).toContainText("Mid-term exam: session 14");
    await expect(facts).toContainText("Maximum 8.0 in the re-sit");
  }
});

test("Edit switches only that card to fields; no name disables Add, and says why", async ({ page }) => {
  await page.goto("/app");
  await page.getByTestId("syllabus-files").setInputFiles([`${DIR}/${MC}`, `${DIR}/${PDFS.find((f) => f !== MC)}`]);
  const add = panel(page).getByRole("button", { name: "Add 2 courses" });
  await expect(add).toBeEnabled(READ);
  await cards(page).getByRole("button", { name: "Edit Management Control" }).click();
  // Only that card is now fields (its name is in a field, so find it by the field).
  const mc = cards(page).filter({ has: page.getByLabel("Course name") });
  await expect(mc).toHaveCount(1);
  await expect(mc.getByLabel("Course name")).toHaveValue("Management Control");

  await mc.getByLabel("Course name").fill("");
  await expect(add).toBeDisabled();
  await expect(panel(page)).toContainText("Add a name to every course to continue.");
  await mc.getByLabel("Course name").fill("Management Control 2");
  await expect(add).toBeEnabled();
  await mc.getByRole("button", { name: "Done" }).click();
  await expect(cards(page).filter({ hasText: "Management Control 2" }).getByRole("heading")).toBeVisible();
});

test("a PDF with nothing found opens in edit mode with Not found – add it", async ({ page }, info) => {
  const junk = info.outputPath("not-a-syllabus.pdf");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    junk,
    "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  );
  const text = info.outputPath("notes.txt");
  writeFileSync(text, "hello");
  await page.goto("/app");
  await page.getByTestId("syllabus-files").setInputFiles([junk, text]);
  await expect(panel(page).getByRole("alert").filter({ hasText: "notes.txt" })).toContainText("isn't a PDF", READ);
  const empty = cards(page).filter({ has: page.getByText("not-a-syllabus.pdf") });
  await expect(empty.getByLabel("Course name")).toBeVisible();
  await expect(empty).toContainText("Not found – add it");
  await expect(panel(page).getByRole("button", { name: "Add 1 course" })).toBeDisabled();
  await empty.getByRole("button", { name: /Don't import/ }).click();
  await panel(page).getByRole("button", { name: "Cancel" }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByTestId("core-item")).toHaveCount(0);
});

test("the same course again: update the existing one instead of a copy", async ({ page }) => {
  await page.goto("/app");
  await page.getByTestId("core-input").fill("management control");
  await page.getByTestId("core-submit").click();
  await expect(page.getByTestId("core-item")).toHaveCount(1);

  await page.getByTestId("syllabus-files").setInputFiles(`${DIR}/${MC}`);
  const card = cards(page).first();
  await expect(card).toContainText("“management control” is already in your courses.", READ);
  await expect(card.getByRole("radio", { name: "Update existing course" })).toBeChecked();
  await panel(page).getByRole("button", { name: "Add 1 course" }).click();
  await expect(panel(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole("status").filter({ hasText: "updated" })).toBeVisible();
  await expect(page.getByTestId("core-item")).toHaveCount(1);
  const course = await openCourse(page, "management control");
  await expect(course).toContainText("5 ECTS");
  await expect(course.getByText("Weights: 100%")).toBeVisible();
});

test("drag and drop PDFs onto the import area", async ({ page }) => {
  await page.goto("/app");
  const bytes = [...readFileSync(`${DIR}/${MC}`)];
  const data = await page.evaluateHandle(
    ({ bytes, name }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, { type: "application/pdf" }));
      return dt;
    },
    { bytes, name: MC! },
  );
  // Its name changes while you drag ("Drop your syllabus PDFs here").
  const zone = page.getByRole("button", { name: /syllabus PDFs/ });
  await zone.dispatchEvent("dragenter", { dataTransfer: data });
  await expect(zone).toContainText("Drop your syllabus PDFs here");
  await zone.dispatchEvent("drop", { dataTransfer: data });
  await expect(cards(page)).toHaveCount(1, READ);
  await expect(cards(page).first().getByRole("heading", { name: "Management Control" })).toBeVisible();
});

test("a course added by name: import its syllabus from inside the course", async ({ page }) => {
  const name = uniqueName("By name");
  await page.goto("/app");
  await page.getByTestId("core-input").fill(name);
  await page.getByTestId("core-submit").click();
  const course = await openCourse(page, name);
  await expect(course.getByText("Import the syllabus to fill in weights and credits")).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await course.getByRole("button", { name: "Import syllabus PDF" }).first().click();
  await (await chooser).setFiles(`${DIR}/${MC}`);
  await expect(cards(page)).toHaveCount(1, READ);
  // Importing into this course: no duplicate question.
  await expect(panel(page).getByRole("radio")).toHaveCount(0);
  await panel(page).getByRole("button", { name: "Update this course" }).click();
  await expect(course.getByText("Weights: 100%")).toBeVisible({ timeout: 30_000 });
  await expect(course).toContainText("5 ECTS");
  await expect(page.getByTestId("core-item").filter({ hasText: name })).toHaveCount(1);
});
