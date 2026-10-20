import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "./fixtures";
import { openCourse, seedCourse } from "./helpers";

// The GPA box on /app and the "GPA details" panel. The worker's account starts empty for each
// test (tests in a worker run one after another), so the numbers only depend on this test.
test.beforeEach(async ({ account }) => {
  for (const table of ["courses", "past_courses", "past_semesters"]) {
    const { error } = await account.db.from(table).delete().not("id", "is", null);
    if (error) throw error;
  }
});

async function withHistory(db: SupabaseClient) {
  // Official: (6×9 + 4×9.5) / 10 = 9.2
  const { error } = await db.from("past_courses").insert([
    { name: "Microeconomics", semester_label: "24/25 · 1st semester", credits: 6, grade: 9, counts_in_gpa: true, position: 0 },
    { name: "Ethics", semester_label: "24/25 · 1st semester", credits: 4, grade: 9.5, counts_in_gpa: true, position: 1 },
  ]);
  if (error) throw error;
}

const box = (page: Page) => page.getByTestId("gpa-box");
const sheet = (page: Page) => page.getByRole("dialog", { name: "GPA details" });

test("adding a grade changes the GPA box at once", async ({ page, account: { db } }) => {
  await withHistory(db);
  const id = await seedCourse(db, "Finance", [{ name: "Midterm", weight: 50 }, { name: "Final", weight: 50 }]);
  await db.from("courses").update({ credits: 5 }).eq("id", id);
  await page.goto("/app");

  await expect(box(page)).toContainText("Overall GPA");
  await expect(box(page)).toContainText("9.20");
  await expect(box(page)).toContainText("official courses");
  // No grades yet this semester: live equals official.
  await expect(box(page).locator("dd").nth(2)).toHaveText("9.20");

  // Hold the save, to show the box doesn't wait for the server.
  await page.route("**/rest/v1/assessments**", async (route) => {
    if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, 4000));
    await route.continue().catch(() => {});
  });
  const card = await openCourse(page, "Finance");
  await card.getByRole("button", { name: "Add grade for Midterm" }).click();
  await card.getByRole("textbox", { name: "Grade for Midterm" }).fill("7");
  await card.getByRole("textbox", { name: "Grade for Midterm" }).press("Enter");
  // Live: (92 + 5×7) / 15 = 8.466… → 8.46; this semester 7.0.
  await expect(box(page)).toContainText("8.46", { timeout: 1500 });
  await expect(box(page)).toContainText("7.0", { timeout: 1500 });
  await expect(box(page)).toContainText("9.20");

  // Remove it again: back to the official GPA.
  await page.unroute("**/rest/v1/assessments**");
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await card.getByRole("button", { name: "Edit grade for Midterm" }).click();
  await card.getByRole("button", { name: "Remove grade" }).click();
  await expect(box(page).locator("dd").nth(2)).toHaveText("9.20");
});

test("the live GPA has an explanation", async ({ page, account: { db } }) => {
  await withHistory(db);
  await page.goto("/app");
  await box(page).getByRole("button", { name: "About the live GPA" }).click();
  await expect(page.getByRole("tooltip")).toContainText("Your official GPA changes only when final grades are recorded.");
  // The ⓘ doesn't open the panel.
  await expect(sheet(page)).toBeHidden();
});

test("GPA details opens and closes (button, Escape), with everything from the GPA page", async ({ page, account: { db } }) => {
  await withHistory(db);
  await page.goto("/app");
  // No Courses | GPA switch any more.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);

  await box(page).getByRole("button", { name: "GPA details" }).click();
  await expect(sheet(page)).toBeVisible();
  for (const heading of ["GPA per semester", "What GPA do I want?", "My history"])
    await expect(sheet(page).getByRole("heading", { name: heading })).toBeVisible();
  await expect(sheet(page).getByText(/Ranking|ranking/).first()).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Import transcript PDF" })).toBeVisible();
  await expect(sheet(page).getByRole("button", { name: "Add manually" })).toBeVisible();
  // The panel fits the screen: no sideways scroll.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  // "What GPA do I want?" works inside the panel.
  await sheet(page).getByLabel("Overall GPA I want").fill("9,5");
  await expect(sheet(page).getByText(/need|reach|secured/i).first()).toBeVisible();

  await sheet(page).getByRole("button", { name: "Close GPA details" }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(box(page).getByRole("button", { name: "GPA details" })).toBeFocused();

  await box(page).getByRole("button", { name: "GPA details" }).click();
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
});

test("/gpa redirects to /app with GPA details open", async ({ page, account: { db } }) => {
  await withHistory(db);
  await page.goto("/app");
  await page.goto("/gpa");
  await expect(page).toHaveURL(/\/app$/);
  await expect(sheet(page)).toBeVisible();
  await expect(page.getByTestId("logout")).toBeVisible();
});

test("no history yet: the box invites you to import, and courses without credits are named", async ({ page, account: { db } }) => {
  await seedCourse(db, "Club Activity", [{ name: "Project", weight: 100, grade: 9 }]);
  await page.goto("/app");
  await expect(box(page)).toContainText("Add your past grades to see your overall GPA");
  await expect(box(page)).toContainText("1 course not counted: no credits");

  const chooser = page.waitForEvent("filechooser");
  await box(page).getByRole("button", { name: "Import transcript" }).click();
  await chooser;
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press("Escape");

  // "Add credits" opens the course at its credits field; once set, the course counts.
  const card = page.getByTestId("core-item").filter({ hasText: "Club Activity" });
  await card.getByRole("button", { name: /Add credits/ }).click();
  await expect(card.getByLabel("Credits (ECTS)")).toBeFocused();
  await card.getByLabel("Credits (ECTS)").fill("3");
  await card.getByLabel("Credits (ECTS)").press("Enter");
  await expect(box(page)).not.toContainText("not counted");
  await expect(box(page)).toContainText("This semester 9.0");
});
