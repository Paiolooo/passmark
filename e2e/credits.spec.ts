import { existsSync, readdirSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { openCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// Credits look automatic: read-only with where they came from, a field only after "Edit".
const MC = existsSync("syllabi-test") ? readdirSync("syllabi-test").find((f) => f.includes("enR9w")) : undefined;

test.beforeEach(async ({ account }) => {
  for (const table of ["courses", "past_courses", "past_semesters"]) {
    const { error } = await account.db.from(table).delete().not("id", "is", null);
    if (error) throw error;
  }
});

/** True once supabase/add-syllabus-info.sql has run (the source of the credits is stored). */
async function storesSource(db: SupabaseClient) {
  return !(await db.from("courses").select("credits_source").limit(1)).error;
}

test("credits from the syllabus are information, editable only via Edit", async ({ page, account }) => {
  test.skip(!MC, "no syllabi in syllabi-test/");
  await page.goto("/app");
  await page.getByTestId("syllabus-files").setInputFiles(`syllabi-test/${MC}`);
  const preview = page.getByRole("dialog", { name: "Your course" });
  await preview.getByRole("button", { name: "Add 1 course" }).click({ timeout: 50_000 });
  await expect(preview).toHaveCount(0, { timeout: 30_000 });
  const course = await openCourse(page, "Management Control");
  const details = course.getByRole("region", { name: "Course details" });
  await expect(details).toContainText("5 ECTS · from your syllabus");
  await expect(details).toContainText("Details from your syllabus.");
  await expect(course.getByText("Weights and minimums from your syllabus.")).toBeVisible();
  await expect(course.getByRole("textbox", { name: "Credits (ECTS)" })).toHaveCount(0);

  await details.getByRole("button", { name: "Edit credits" }).click();
  const field = course.getByRole("textbox", { name: "Credits (ECTS)" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("5");
  // Escape changes nothing.
  await field.press("Escape");
  await expect(details).toContainText("5 ECTS · from your syllabus");
  await details.getByRole("button", { name: "Edit credits" }).click();
  await field.fill("6");
  await field.press("Enter");
  await expect(details).toContainText("6 ECTS · entered by you");
  if (await storesSource(account.db)) {
    await page.reload();
    await expect((await openCourse(page, "Management Control")).getByRole("region", { name: "Course details" })).toContainText(
      "6 ECTS · entered by you",
    );
  }
});

test("a course added by name gets its credits from your history automatically", async ({ page, account }) => {
  const name = uniqueName("Corporate Finance");
  await account.db
    .from("past_courses")
    .insert({ name, semester_label: "25/26 · 2nd semester", credits: 6, grade: 4, counts_in_gpa: true, position: 0 });
  await page.goto("/app");
  await page.getByTestId("core-input").fill(name.toLowerCase());
  await page.getByTestId("core-submit").click();
  const card = page.getByTestId("core-item").filter({ hasText: name.toLowerCase() });
  await expect(card).toContainText("6 ECTS");
  const course = await openCourse(page, name.toLowerCase());
  await expect(course.getByRole("region", { name: "Course details" })).toContainText("6 ECTS · from your transcript");
  await expect(course.getByText("Import the syllabus to add credits")).toHaveCount(0);
});

test("no match: a small prompt to import the syllabus, or enter them manually", async ({ page }) => {
  const name = uniqueName("Unknown course");
  await page.goto("/app");
  await page.getByTestId("core-input").fill(name);
  await page.getByTestId("core-submit").click();
  const course = await openCourse(page, name);
  const details = course.getByRole("region", { name: "Course details" });
  await expect(details).toContainText("Import the syllabus to add credits");
  await expect(details.getByRole("button", { name: "Import syllabus PDF" })).toBeVisible();
  // Not both prompts at once.
  await expect(course.getByText("Import the syllabus to fill in weights and credits.")).toHaveCount(0);

  await details.getByRole("button", { name: "Enter manually" }).click();
  await details.getByRole("textbox", { name: "Credits (ECTS)" }).fill("abc");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(details.getByRole("alert")).toContainText("Use a number above 0");
  await details.getByRole("textbox", { name: "Credits (ECTS)" }).fill("4,5");
  await details.getByRole("button", { name: "Save" }).click();
  await expect(details).toContainText("4.5 ECTS · entered by you");
  // The GPA box counts it now.
  await expect(page.getByTestId("gpa-box")).not.toContainText("no credits");
});

test("importing a transcript fills in credits of courses you added by name", async ({ page }) => {
  test.skip(!existsSync("transcript-test/transcript.pdf"), "no transcript in transcript-test/");
  // A course in progress on the transcript, added here by name only (name read from the PDF itself).
  // A brand-new account has no GPA box yet: /gpa opens GPA details directly.
  await page.goto("/gpa");
  const sheet = page.getByRole("dialog", { name: "GPA details" });
  const chooser = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "Import transcript PDF" }).first().click();
  await (await chooser).setFiles("transcript-test/transcript.pdf");
  const inProgress = sheet.getByText(/courses? in progress/);
  await expect(inProgress).toBeVisible({ timeout: 30_000 });
  const current = sheet.getByRole("list", { name: "Courses in progress" });
  const first = (await current.getByRole("listitem").first().locator("span").first().innerText()).trim();
  await sheet.getByRole("button", { name: "Cancel" }).first().click();
  await page.keyboard.press("Escape");

  await page.getByTestId("core-input").fill(first);
  await page.getByTestId("core-submit").click();
  await page.getByTestId("gpa-box").getByRole("button", { name: /GPA details/ }).first().click();
  const chooser2 = page.waitForEvent("filechooser");
  await sheet.getByRole("button", { name: "Import transcript PDF" }).first().click();
  await (await chooser2).setFiles("transcript-test/transcript.pdf");
  await expect(inProgress).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  const course = await openCourse(page, first);
  await expect(course.getByRole("region", { name: "Course details" })).toContainText("from your transcript");
});
