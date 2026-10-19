import { REPORTED_COURSE, openCourse, seedCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// Bug 2: every row without a grade has a visible "Add grade"; rows with a grade show it with "Edit".

const LEAVES = ["Final Exam", "Class Participation", "Intermediate Tests", "Assignment #1", "Assignment #2"];

test("add a grade to every row, one after another, including parts", async ({ page, account }) => {
  const name = uniqueName("Grades");
  await seedCourse(account.db, name, REPORTED_COURSE);
  await page.goto("/app");
  const card = await openCourse(page, name);
  const result = card.getByRole("region", { name: "Result" });

  for (const n of LEAVES) await expect(card.getByRole("button", { name: `Add grade for ${n}` })).toBeVisible();

  const grades = ["6,5", "8", "7.5", "9", "5,5"];
  for (const [i, n] of LEAVES.entries()) {
    const before = await result.textContent();
    await card.getByRole("button", { name: `Add grade for ${n}` }).click();
    const field = card.getByRole("textbox", { name: `Grade for ${n}` });
    await expect(field).toBeFocused();
    await field.fill(grades[i]);
    await card.getByRole("button", { name: "Save", exact: true }).click();
    await expect(card.getByRole("button", { name: `Add grade for ${n}` })).toHaveCount(0);
    await expect(card.getByRole("button", { name: `Edit grade for ${n}` })).toBeVisible();
    await expect(card.getByTestId("assessment-row").filter({ hasText: n }).first()).toContainText(
      grades[i].replace(",", ".").replace(/^(\d)$/, "$1.0"),
    );
    // The result updates for every grade saved.
    await expect(result).not.toHaveText(before!);
  }
  // 6.5·40 + 8·15 + 7.5·25 + 9·5 + 5.5·15 = 6.95, shown rounded down (never too optimistic).
  await expect(card.getByText("final grade", { exact: true })).toBeVisible();
  await expect(card.getByRole("region", { name: "Result" })).toContainText("Final grade: 6.9");

  // Like a student: wait until every grade is saved, then come back.
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await page.reload();
  const again = await openCourse(page, name);
  for (const n of LEAVES) await expect(again.getByRole("button", { name: `Edit grade for ${n}` })).toBeVisible();
});

test("edit, remove and cancel a grade", async ({ page, account }) => {
  const name = uniqueName("Grades");
  await seedCourse(account.db, name, [{ ...REPORTED_COURSE[0], grade: 6 }, ...REPORTED_COURSE.slice(1)]);
  await page.goto("/app");
  const card = await openCourse(page, name);

  // Cancel leaves everything as it was.
  await card.getByRole("button", { name: "Add grade for Class Participation" }).click();
  await card.getByRole("textbox", { name: "Grade for Class Participation" }).fill("9");
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(card.getByRole("textbox", { name: "Grade for Class Participation" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: "Add grade for Class Participation" })).toBeVisible();

  // Invalid input shows an error and does not save.
  await card.getByRole("button", { name: "Add grade for Class Participation" }).click();
  await card.getByRole("textbox", { name: "Grade for Class Participation" }).fill("11");
  await card.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card.getByRole("alert").filter({ hasText: "0 to 10" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Change the grade.
  await card.getByRole("button", { name: "Edit grade for Final Exam" }).click();
  const field = card.getByRole("textbox", { name: "Grade for Final Exam" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("6.0");
  await field.fill("4,2");
  await field.press("Enter");
  await expect(card.getByTestId("assessment-row").filter({ hasText: "Final Exam" })).toContainText("4.2");

  // Remove it: the row is open again.
  await card.getByRole("button", { name: "Edit grade for Final Exam" }).click();
  await card.getByRole("button", { name: "Remove grade" }).click();
  await expect(card.getByRole("button", { name: "Add grade for Final Exam" })).toBeVisible();
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await page.reload();
  await expect((await openCourse(page, name)).getByRole("button", { name: "Add grade for Final Exam" })).toBeVisible();
});
