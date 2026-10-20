import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// Syllabus import, the main way to add courses. The real IE syllabi live in syllabi-test/ (never
// committed): these tests skip without them. The worker's account starts each test with no courses.
const DIR = "syllabi-test";
const PDFS = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith(".pdf")) : [];
const MC = PDFS.find((f) => f.includes("enR9w")); // MANAGEMENT CONTROL: 25 sessions, 5 ECTS

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

const preview = (page: Page) => page.getByRole("region", { name: /Check your courses|Check what we read/ });
const cards = (page: Page) => page.getByRole("article");
const courseCard = (page: Page, name: string | RegExp) => page.getByTestId("core-item").filter({ hasText: name });

test("import a whole semester at once: one preview, then Add all courses", async ({ page, account }) => {
  await page.goto("/app");
  // The grading contract's form stays visible next to the import.
  await expect(page.getByTestId("core-input")).toBeVisible();
  await expect(page.getByTestId("core-submit")).toBeVisible();

  await page.getByTestId("syllabus-files").setInputFiles(PDFS.map((f) => `${DIR}/${f}`));
  const add = page.getByRole("button", { name: `Add all courses (${PDFS.length})` });
  await expect(add).toBeEnabled({ timeout: 30_000 });
  await expect(cards(page)).toHaveCount(PDFS.length);
  for (const card of await cards(page).all()) {
    await expect(card.getByText("Weights add up to 100%")).toBeVisible();
    await expect(card.getByLabel("Course name")).not.toHaveValue("");
  }
  const mc = cards(page).filter({ has: page.getByText(MC!) });
  await expect(mc.getByLabel("Credits (ECTS)")).toHaveValue("5");
  await expect(mc.getByLabel("Semester")).toHaveValue("26/27 · 1st semester");
  await expect(mc).toContainText("Max absences: 5 of 25 sessions");
  await expect(mc.getByLabel("Mid-term exam, session")).toHaveValue("14");
  await expect(mc.getByLabel("Re-sit maximum grade")).toHaveValue("8.0");
  // Nothing personal is shown.
  await expect(preview(page)).not.toContainText("@");

  await add.click();
  await expect(preview(page)).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByTestId("core-item")).toHaveCount(PDFS.length);
  await page.reload();
  await expect(page.getByTestId("core-item")).toHaveCount(PDFS.length);

  const course = await openCourse(page, "MANAGEMENT CONTROL");
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

test("the same course again: update the existing one instead of a copy", async ({ page }) => {
  await page.goto("/app");
  await page.getByTestId("core-input").fill("management control");
  await page.getByTestId("core-submit").click();
  await expect(page.getByTestId("core-item")).toHaveCount(1);

  await page.getByTestId("syllabus-files").setInputFiles(`${DIR}/${MC}`);
  const card = cards(page).first();
  await expect(card).toContainText("“management control” is already in your courses.", { timeout: 20_000 });
  await expect(card.getByRole("radio", { name: "Update existing course" })).toBeChecked();
  await page.getByRole("button", { name: "Add course", exact: true }).last().click();
  await expect(preview(page)).toHaveCount(0, { timeout: 20_000 });
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
  await expect(cards(page)).toHaveCount(1, { timeout: 20_000 });
  await expect(cards(page).first().getByLabel("Course name")).toHaveValue("MANAGEMENT CONTROL");
});

test("remove a card, and a file that isn't a syllabus", async ({ page }, info) => {
  const junk = info.outputPath("not-a-syllabus.pdf");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    junk,
    "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  );
  const text = info.outputPath("notes.txt");
  writeFileSync(text, "hello");
  await page.goto("/app");
  await page.getByTestId("syllabus-files").setInputFiles([`${DIR}/${PDFS[0]}`, junk, text]);
  await expect(page.getByRole("alert").filter({ hasText: "notes.txt" })).toContainText("isn't a PDF", { timeout: 20_000 });
  // The empty PDF still makes a card, with everything marked "not found".
  const empty = cards(page).filter({ has: page.getByText("not-a-syllabus.pdf") });
  await expect(empty).toContainText("not found");
  await empty.getByRole("button", { name: /Don't import/ }).click();
  await expect(cards(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Cancel import" }).click();
  await expect(preview(page)).toHaveCount(0);
  await expect(page.getByTestId("core-item")).toHaveCount(0);
});

test("a course added by name invites the syllabus import, which fills it in", async ({ page }) => {
  const name = uniqueName("By name");
  await page.goto("/app");
  await page.getByTestId("core-input").fill(name);
  await page.getByTestId("core-submit").click();
  const course = await openCourse(page, name);
  await expect(course.getByText("Import the syllabus to fill in weights and credits")).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await course.getByRole("button", { name: "Import syllabus PDF" }).click();
  await (await chooser).setFiles(`${DIR}/${MC}`);
  await expect(course.getByRole("article")).toHaveCount(1, { timeout: 20_000 });
  // Importing into this course: no duplicate question, and the course keeps its name.
  await expect(course.getByRole("radio")).toHaveCount(0);
  await course.getByRole("button", { name: "Save", exact: true }).click();
  await expect(course.getByText("Weights: 100%")).toBeVisible({ timeout: 20_000 });
  await expect(course).toContainText("5 ECTS");
  await expect(courseCard(page, name)).toHaveCount(1);
});
