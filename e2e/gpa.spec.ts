import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, test, uniqueName } from "./fixtures";

// The GPA page like a student uses it. Runs at both viewports (phone 375px and desktop).
// The real transcript lives in transcript-test/ (never committed): that test skips without it.
const TRANSCRIPT = "transcript-test/transcript.pdf";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each test starts with an empty history (the worker's account is shared by its tests). */
async function clearHistory(db: SupabaseClient) {
  const a = await db.from("past_courses").delete().not("id", "is", null);
  const b = await db.from("past_semesters").delete().not("id", "is", null);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
}

/** Next's route announcer also has role=alert, so alerts are found by their text. */
const alert = (page: Page, text: string | RegExp) => page.getByRole("alert").filter({ hasText: text });

/** A semester card in "My history". */
const semesterCard = (page: Page, label: string) =>
  page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: new RegExp(esc(label)) }) });

/** The overall GPA tile's final value (what screen readers get), or "–". */
async function overallGpa(page: Page): Promise<string> {
  const dd = page.getByRole("region", { name: "Your GPA" }).locator("dd").first();
  const sr = dd.locator(".sr-only");
  return (await sr.count()) > 0 ? (await sr.innerText()).trim() : (await dd.innerText()).trim();
}

/** Flips a Switch by clicking its label (the checkbox itself is visually hidden). */
async function flip(page: Page, scope: ReturnType<Page["locator"]>, name: string | RegExp) {
  await scope.locator("label").filter({ has: page.getByRole("switch", { name }) }).click();
}

async function expectSaneNumbers(page: Page) {
  await expect(page.locator("main")).not.toContainText(/NaN|Infinity|undefined/);
}

async function expectNoSideScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ account }) => {
  await clearHistory(account.db);
});

test("page loads for a logged-in student", async ({ page }) => {
  await page.goto("/gpa");
  await expect(page.getByRole("heading", { level: 1, name: "GPA" })).toBeVisible();
  await expect(page.getByTestId("logout")).toBeVisible();
  await expect(page.getByRole("region", { name: "Your GPA" })).toContainText("Overall GPA");
  await expect(page.getByText("Add your past semesters", { exact: true })).toBeVisible();
  await expectSaneNumbers(page);
  await expectNoSideScroll(page);
});

test("semester GPAs: add with comma decimals, rename to a taken label, edit, delete", async ({ page }) => {
  const first = uniqueName("Sem A");
  const second = uniqueName("Sem B");
  await page.goto("/gpa");
  await page.getByRole("button", { name: "Add manually" }).first().click();
  const add = page.getByRole("region", { name: "Add your history" });

  await add.getByLabel("Semester", { exact: true }).fill(first);
  await add.getByLabel("Semester GPA (0–10)").fill("7,4");
  await add.getByLabel("ECTS").fill("30,5");
  await add.getByRole("button", { name: "Save semester GPA" }).click();
  await expect(add.getByText(`Added ${first}.`)).toBeVisible();

  // Out of range values are refused.
  await add.getByLabel("Semester", { exact: true }).fill(second);
  await add.getByLabel("Semester GPA (0–10)").fill("10,5");
  await add.getByLabel("ECTS").fill("30");
  await add.getByRole("button", { name: "Save semester GPA" }).click();
  await expect(alert(page, "GPA: use a number from 0 to 10")).toBeVisible();
  await add.getByLabel("Semester GPA (0–10)").fill("8,6");
  await add.getByRole("button", { name: "Save semester GPA" }).click();
  await expect(add.getByText(`Added ${second}.`)).toBeVisible();
  await add.getByRole("button", { name: "Done" }).click();

  await expect(semesterCard(page, first).getByRole("heading")).toContainText("7.4");
  await expect(semesterCard(page, second).getByRole("heading")).toContainText("8.6");
  await expect.poll(() => overallGpa(page)).not.toBe("–");

  // Renaming B to A's label (any case) is blocked: it would hide one of them.
  const cardB = semesterCard(page, second);
  await cardB.getByRole("button", { name: `More for the ${second} GPA` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const form = page.getByRole("form", { name: `Edit the ${second} GPA` });
  await form.getByLabel("Semester").fill(first.toLowerCase());
  await form.getByRole("button", { name: "Save" }).click();
  await expect(alert(page, "You already typed a GPA for")).toBeVisible();
  await expect(semesterCard(page, second)).toHaveCount(1);

  // Cancel throws the edit away: opening it again shows what is saved.
  await form.getByRole("button", { name: "Cancel" }).click();
  await cardB.getByRole("button", { name: `More for the ${second} GPA` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(form.getByLabel("Semester")).toHaveValue(second);
  await expect(alert(page, "You already typed a GPA for")).toHaveCount(0);

  // Edit the GPA with a comma.
  await form.getByLabel("GPA", { exact: true }).fill("8,25");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form).toHaveCount(0);
  await expect(cardB.getByRole("heading")).toContainText("8.3");
  await page.reload();
  await expect(semesterCard(page, second).getByRole("heading")).toContainText("8.3");

  // Delete it.
  const reloadedB = semesterCard(page, second);
  if ((await reloadedB.getByRole("button", { name: `More for the ${second} GPA` }).count()) === 0) {
    await reloadedB.getByRole("heading").getByRole("button").click();
  }
  await reloadedB.getByRole("button", { name: `More for the ${second} GPA` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await reloadedB.getByRole("button", { name: "Yes, delete" }).click();
  await expect(semesterCard(page, second)).toHaveCount(0);
  await expect(semesterCard(page, first)).toHaveCount(1);
  await expectSaneNumbers(page);
  await expectNoSideScroll(page);
});

test("courses: add by hand, Pass then a grade counts, edit and delete", async ({ page }) => {
  const label = uniqueName("Sem C");
  const micro = uniqueName("Microeconomics");
  const ethics = uniqueName("Ethics");
  await page.goto("/gpa");
  await page.getByRole("button", { name: "Add manually" }).first().click();
  const add = page.getByRole("region", { name: "Add your history" });
  await add.getByRole("button", { name: "Individual courses" }).click();
  await add.getByLabel("Semester", { exact: true }).fill(label);
  await expectNoSideScroll(page);

  // Row 2 stays empty: the error names the row you see (Course 3), not the 2nd filled one.
  await add.getByLabel("Course 1", { exact: true }).fill(micro);
  await add.getByLabel("ECTS").nth(0).fill("6");
  await add.getByLabel("Grade or result").nth(0).fill("7,5");
  await add.getByLabel("ECTS").nth(2).fill("3");
  await add.getByLabel("Grade or result").nth(2).fill("Pass");
  await add.getByRole("button", { name: "Save courses" }).click();
  await expect(alert(page, "Course 3 needs a name.")).toBeVisible();
  await add.getByLabel("Course 3", { exact: true }).fill(ethics);
  await add.getByRole("button", { name: "Save courses" }).click();
  await expect(add.getByText(`Added 2 courses to ${label}.`)).toBeVisible();
  await add.getByRole("button", { name: "Done" }).click();

  const card = semesterCard(page, label);
  await expect(card.getByText(micro, { exact: true })).toBeVisible();
  await expect(card.getByText("Pass")).toBeVisible();
  await expect(card.getByRole("heading")).toContainText("7.5");
  await expect(card.getByRole("switch", { name: new RegExp(`${esc(ethics)} has no numeric grade`) })).toBeDisabled();

  // Pass → 6: the course now counts. (7.5 × 6 + 6 × 3) / 9 = 7.0
  await card.getByRole("button", { name: `More for ${ethics}` }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const edit = page.getByRole("form", { name: `Edit ${ethics}` });
  await edit.getByLabel("Grade or result").fill("6");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  await expect(card.getByRole("switch", { name: `Counts in GPA: ${ethics}` })).toBeChecked();
  await expect(card.getByRole("heading")).toContainText("7.0");

  // Switch a course off and on.
  await flip(page, card, `Counts in GPA: ${micro}`);
  await expect(card.getByRole("heading")).toContainText("6.0");
  await flip(page, card, `Counts in GPA: ${micro}`);
  await expect(card.getByRole("heading")).toContainText("7.0");

  // Delete one course.
  await card.getByRole("button", { name: `More for ${micro}` }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await card.getByRole("button", { name: "Yes, delete" }).click();
  await expect(card.getByText(micro, { exact: true })).toHaveCount(0);
  await expect(card.getByRole("heading")).toContainText("6.0");
  await page.reload();
  await expect(semesterCard(page, label).getByRole("heading")).toContainText("6.0");
  await expectSaneNumbers(page);
  await expectNoSideScroll(page);
});

test("target GPA and ranking card show real numbers", async ({ page, account }) => {
  const { error } = await account.db
    .from("past_semesters")
    .insert({ label: uniqueName("Sem D"), gpa: 7, credits: 30, position: 0 });
  if (error) throw error;
  await page.goto("/gpa");

  const target = page.getByLabel("Overall GPA I want");
  await target.fill("11");
  await expect(page.getByText("Use a number from 0 to 10, e.g. 7,5.")).toBeVisible();
  await target.fill("7,5");
  await expect(page.getByText("Use a number from 0 to 10, e.g. 7,5.")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "What GPA do I want?" })).toContainText(
    /average needed this semester|Not reachable this semester|Already secured|No unfinished courses/,
  );

  const ranking = page.getByRole("region", { name: "Ranking in your degree" });
  await expect(ranking).toBeVisible();
  await expect(ranking).toContainText("Estimate, not an official IE ranking.");
  const gpaField = ranking.getByLabel("Your GPA in your last completed semester");
  if ((await gpaField.count()) > 0) {
    await gpaField.fill("8,4");
    await expect(ranking).not.toContainText(/NaN|Infinity/);
    for (const chip of ["Top 1%", "Top 5%", "Top 10%", "Top 25%"]) {
      await ranking.getByRole("button", { name: chip }).click();
      await expect(ranking).not.toContainText(/NaN|Infinity/);
    }
  }
  await expectSaneNumbers(page);
  await expectNoSideScroll(page);
});

test.describe("transcript import", () => {
  test.skip(!existsSync(TRANSCRIPT), "no transcript in transcript-test/");

  async function choose(page: Page) {
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Import transcript PDF" }).first().click();
    await (await chooser).setFiles(TRANSCRIPT);
    const review = page.getByRole("region", { name: "Check what we read from your transcript" });
    await expect(review).toBeVisible({ timeout: 20_000 });
    return review;
  }

  const savedRows = async (db: SupabaseClient) => {
    const { count, error } = await db.from("past_courses").select("id", { count: "exact", head: true });
    if (error) throw error;
    return count ?? 0;
  };

  test("import, then importing again doesn't double anything", async ({ page, account }) => {
    await page.goto("/gpa");
    const review = await choose(page);
    await expect(review).not.toContainText(/NaN|Infinity/);
    await expectNoSideScroll(page);
    const save = review.getByRole("button", { name: /^Save \d+ courses?$/ });
    const n = Number((await save.innerText()).match(/\d+/)?.[0]);
    expect(n).toBeGreaterThan(0);
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: `Saved ${n} course` })).toBeVisible();
    expect(await savedRows(account.db)).toBe(n);
    await expect.poll(() => overallGpa(page)).not.toBe("–");
    const before = await overallGpa(page);

    // Same PDF again with "Replace" off: everything is already there, nothing is added.
    const again = await choose(page);
    await expect(again.getByText(/already in your history and will be skipped/)).toBeVisible();
    await again.getByRole("button", { name: /^Save 0 courses$/ }).click();
    await expect(alert(page, "already in your history")).toBeVisible();
    await again.getByRole("button", { name: "Cancel" }).click();
    expect(await savedRows(account.db)).toBe(n);
    expect(await overallGpa(page)).toBe(before);

    // With "Replace" on, the old rows are swapped for the new ones: still n rows, same GPA.
    const replace = await choose(page);
    const replaceSwitch = /^Replace the \d+ courses? already in my history$/;
    await flip(page, replace, replaceSwitch);
    await expect(replace.getByRole("switch", { name: replaceSwitch })).toBeChecked();
    await replace.getByRole("button", { name: `Save ${n} course${n === 1 ? "" : "s"}` }).click();
    await expect(page.getByRole("status").filter({ hasText: `Saved ${n} course` })).toBeVisible();
    expect(await savedRows(account.db)).toBe(n);
    await expect.poll(() => overallGpa(page)).toBe(before);
    await page.reload();
    await expect.poll(() => overallGpa(page)).toBe(before);
    await expectSaneNumbers(page);
  });
});
