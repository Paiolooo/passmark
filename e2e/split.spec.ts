import { openCourse, seedCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

test("split into parts, grade the parts, then best K of N", async ({ page, account }) => {
  const name = uniqueName("Split");
  await seedCourse(account.db, name, [
    { name: "Final Exam", weight: 70 },
    { name: "Quizzes", weight: 30, grade: 6 },
  ]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  const row = (n: string) => card.getByTestId("assessment-row").filter({ has: page.getByText(n, { exact: true }) });

  await card.getByRole("button", { name: "More for Quizzes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Split into parts" }).click();
  await card.getByLabel("Number of parts").fill("3");
  await expect(card.getByText("Its current grade will be cleared")).toBeVisible();
  await card.getByRole("button", { name: "Create 3 parts" }).click();
  for (const i of [1, 2, 3]) await expect(row(`Quizzes ${i}`)).toContainText("10%");
  await expect(card.getByRole("button", { name: /Quizzes/ }).and(card.locator("[aria-controls]"))).toHaveAttribute("aria-expanded", "true");

  for (const [i, g] of [[1, "4"], [2, "8,5"], [3, "9"]] as const) {
    await card.getByRole("button", { name: `Add grade for Quizzes ${i}` }).click();
    await card.getByRole("textbox", { name: `Grade for Quizzes ${i}` }).fill(g);
    await card.getByRole("textbox", { name: `Grade for Quizzes ${i}` }).press("Enter");
    await expect(card.getByRole("button", { name: `Edit grade for Quizzes ${i}` })).toBeVisible();
  }
  // (4 + 8.5 + 9) / 3 = 7.2
  await expect(row("Quizzes")).toContainText("7.2");

  // Best 2 of 3: the 4 no longer counts; the parent shows (8.5 + 9) / 2 = 8.8
  await card.getByRole("button", { name: "More for Quizzes", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit weight/minimum" }).click();
  await card.getByLabel("Only the best K of 3 count").check();
  await card.getByLabel("K (how many count)").fill("2");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(row("Quizzes")).toContainText("best 2 of 3 count");
  await expect(row("Quizzes")).toContainText("8.8");
  await expect(row("Quizzes 1")).toContainText("not counted");

  // Removing a part's grade makes it plannable again, other rows untouched.
  await card.getByRole("button", { name: "Edit grade for Quizzes 3" }).click();
  await card.getByRole("button", { name: "Remove grade" }).click();
  await expect(card.getByRole("button", { name: "Add grade for Quizzes 3" })).toBeVisible();
  await expect(row("Quizzes 1")).toBeVisible();
  await expect(row("Final Exam")).toBeVisible();

  // Delete a part; the parent keeps working with the rest.
  await card.getByRole("button", { name: "More for Quizzes 2" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await card.getByRole("button", { name: "Yes, delete" }).click();
  await expect(row("Quizzes 2")).toHaveCount(0);
  await expect(row("Quizzes")).toContainText(/best 2 of 2 count|2 parts/);
  await page.reload();
  const again = await openCourse(page, name);
  await expect(again.getByTestId("assessment-row")).toHaveCount(4);
});
