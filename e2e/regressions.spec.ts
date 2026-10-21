import { existsSync, readdirSync } from "node:fs";
import { openCourse, seedCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// One test per bug found in the sweep (see the commit message for the list).

test("landing demo: 6.6 on the final (6.96) is not shown as reaching 7.0", async ({ browser }) => {
  const page = await browser.newPage({ storageState: undefined });
  await page.goto("/");
  await page.getByRole("slider").first().fill("6.6");
  await expect(page.getByText("Passed, below target")).toBeVisible();
  await page.getByRole("slider").first().fill("6.8");
  await expect(page.getByText("Target reached")).toBeVisible();
  await page.close();
});

test("two assessments with the same name have independent sliders", async ({ page, account }) => {
  const name = uniqueName("Same");
  await seedCourse(account.db, name, [
    { name: "Quiz", weight: 20 },
    { name: "Quiz", weight: 30 },
    { name: "Final", weight: 50 },
  ], 6);
  await page.goto("/app");
  const card = await openCourse(page, name);
  const quiz = card.getByRole("slider", { name: "Plan for Quiz" });
  await expect(quiz).toHaveCount(2);
  await quiz.first().fill("10");
  expect(Number(await quiz.first().inputValue())).toBe(10);
  expect(Number(await quiz.nth(1).inputValue())).toBeLessThan(10);
});

test("best K of N: K graded with a part still open is not final, and the open part is plannable", async ({ page, account }) => {
  const name = uniqueName("BestOf");
  await seedCourse(account.db, name, [
    { name: "Final", weight: 50, grade: 6 },
    { name: "Quizzes", weight: 50, best_of: 2, parts: [{ name: "Quiz 1", weight: 50 / 3, grade: 3 }, { name: "Quiz 2", weight: 50 / 3, grade: 4 }, { name: "Quiz 3", weight: 50 / 3 }] },
  ]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  const result = card.getByRole("region", { name: "Result" });
  await expect(result).not.toContainText("Final grade");
  await expect(result).not.toContainText("Not passed");
  // Needs 4.0 on Quiz 3 (it replaces the 3).
  await expect(result).toContainText("4.0");
  await expect(card.getByRole("button", { name: "Add grade for Quiz 3" })).toBeVisible();
  // The only open row left: it shows what you need.
  await expect(card.getByTestId("assessment-row").filter({ hasText: "Quiz 3" })).toContainText("Need");
});

test("a grade below its minimum: the planner never says Pass", async ({ page, account }) => {
  const name = uniqueName("Min");
  await seedCourse(account.db, name, [
    { name: "Final", weight: 50, grade: 3, min_grade: 4 },
    { name: "Midterm", weight: 25 },
    { name: "Project", weight: 25 },
  ]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  await expect(card.getByTestId("projected-grade").locator("..").locator("..")).toContainText("Below minimum");
  await expect(card.getByText("Pass", { exact: true })).toHaveCount(0);
});

test("a minimum on a parent with parts is enforced in the plan message", async ({ page, account }) => {
  const name = uniqueName("ParentMin");
  await seedCourse(account.db, name, [
    { name: "Final", weight: 50, grade: 10 },
    { name: "Midterm", weight: 50, min_grade: 5, parts: [{ name: "M1", weight: 25 }, { name: "M2", weight: 25 }] },
  ]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  await expect(card.getByText(/Below the minimum on Midterm/)).toBeVisible();
  // Plan 6 on M1 and pin it (otherwise it gives way when M2 moves), then 6 on M2.
  await card.getByRole("slider", { name: "Plan for M1" }).fill("6");
  await card.getByRole("button", { name: "More for M1" }).click();
  await page.getByRole("menuitem", { name: "Pin plan" }).click();
  await card.getByRole("slider", { name: "Plan for M2" }).fill("6");
  await expect(card.getByText(/Below the minimum on Midterm/)).toHaveCount(0);
});

test("a failed split keeps the grade; a failed grade save is undone and explained", async ({ page, account }) => {
  const name = uniqueName("Fail");
  await seedCourse(account.db, name, [{ name: "Final", weight: 60 }, { name: "Quizzes", weight: 40, grade: 7 }]);
  await page.goto("/app");
  const card = await openCourse(page, name);

  await page.route("**/rest/v1/assessments**", (route) =>
    route.request().method() === "GET" ? route.continue() : route.abort("failed"),
  );
  await card.getByRole("button", { name: "More for Quizzes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Split into parts" }).click();
  await card.getByRole("button", { name: "Create 2 parts" }).click();
  await expect(card.getByText("Couldn't create the parts")).toBeVisible();
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByRole("button", { name: "Edit grade for Quizzes" })).toBeVisible();

  await card.getByRole("button", { name: "Add grade for Final" }).click();
  await card.getByRole("textbox", { name: "Grade for Final" }).fill("8");
  await card.getByRole("textbox", { name: "Grade for Final" }).press("Enter");
  await expect(card.getByRole("alert").filter({ hasText: "Couldn't save" })).toBeVisible();
  await expect(card.getByRole("button", { name: "Add grade for Final" })).toBeVisible();

  await page.unroute("**/rest/v1/assessments**");
  await page.reload();
  const again = await openCourse(page, name);
  await expect(again.getByRole("button", { name: "Edit grade for Quizzes" })).toBeVisible();
  await expect(again.getByTestId("assessment-row")).toHaveCount(2);
});

test("a parent whose parts don't add up says so even with its parts hidden", async ({ page, account }) => {
  const name = uniqueName("Parts");
  await seedCourse(account.db, name, [
    { name: "Final", weight: 70 },
    { name: "Work", weight: 30, parts: [{ name: "W1", weight: 10 }, { name: "W2", weight: 10 }] },
  ]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  await card.getByRole("button", { name: /^Work/ }).and(card.locator("[aria-controls]")).click();
  await expect(card.getByTestId("assessment-row").filter({ hasText: "Work" })).toContainText("parts add up to 20%");
});

const PDF = existsSync("syllabi-test")
  ? readdirSync("syllabi-test").find((f) => f.includes("enR9w")) // MANAGEMENT CONTROL (5 credits)
  : undefined;

test("importing a syllabus into a course updates the credits field shown", async ({ page }) => {
  test.skip(!PDF, "no syllabi in syllabi-test/");
  const name = uniqueName("Credits");
  await page.goto("/app");
  await page.getByTestId("core-input").fill(name);
  await page.getByTestId("core-submit").click();
  const card = await openCourse(page, name);
  await card.getByRole("button", { name: "Enter manually" }).click();
  await card.getByLabel("Credits (ECTS)").fill("6");
  await card.getByLabel("Credits (ECTS)").press("Enter");
  await expect(card).toContainText("6 ECTS");
  const chooser = page.waitForEvent("filechooser");
  await card.getByRole("button", { name: "Import syllabus PDF" }).first().click();
  await (await chooser).setFiles(`syllabi-test/${PDF}`);
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card).toContainText("5 ECTS");
  await expect(card.getByRole("region", { name: "Course details" })).toContainText("5 ECTS · from your syllabus");
});

test("leaving the page while a grade is still saving asks first", async ({ page, account }) => {
  const name = uniqueName("Leave");
  await seedCourse(account.db, name, [{ name: "Final", weight: 100 }]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  // Hold the save so it is still running when the student tries to leave.
  await page.route("**/rest/v1/assessments**", async (route) => {
    if (route.request().method() === "PATCH") await new Promise((r) => setTimeout(r, 3000));
    await route.continue().catch(() => {});
  });
  await card.getByRole("button", { name: "Add grade for Final" }).click();
  await card.getByRole("textbox", { name: "Grade for Final" }).fill("7");
  await card.getByRole("textbox", { name: "Grade for Final" }).press("Enter");
  const dialog = page.waitForEvent("dialog");
  void page.close({ runBeforeUnload: true });
  expect((await dialog).type()).toBe("beforeunload");
  await (await dialog).dismiss();
});


test("changing a grade and then removing it quickly: the removal wins", async ({ page, account }) => {
  const name = uniqueName("Race");
  await seedCourse(account.db, name, [{ name: "Final", weight: 100, grade: 6 }]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  // The first save is slow, so the second one would overtake it without ordering.
  let first = true;
  await page.route("**/rest/v1/assessments**", async (route) => {
    if (route.request().method() === "PATCH" && first) {
      first = false;
      await new Promise((r) => setTimeout(r, 2000));
    }
    await route.continue().catch(() => {});
  });
  await card.getByRole("button", { name: "Edit grade for Final" }).click();
  await card.getByRole("textbox", { name: "Grade for Final" }).fill("4,2");
  await card.getByRole("textbox", { name: "Grade for Final" }).press("Enter");
  await card.getByRole("button", { name: "Edit grade for Final" }).click();
  await card.getByRole("button", { name: "Remove grade" }).click();
  await expect(card.getByRole("button", { name: "Add grade for Final" })).toBeVisible();
  await expect(page.getByText("Saving…")).toHaveCount(0, { timeout: 15_000 });
  await expect(card.getByRole("button", { name: "Add grade for Final" })).toBeVisible();
  await page.unroute("**/rest/v1/assessments**");
  await page.reload();
  await expect((await openCourse(page, name)).getByRole("button", { name: "Add grade for Final" })).toBeVisible();
});
