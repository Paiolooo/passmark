import { openCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

test("add a course, add assessments by hand, target and credits", async ({ page }) => {
  const name = uniqueName("Manual");
  await page.goto("/app");
  await page.getByTestId("core-submit").click();
  await expect(page.getByRole("alert").filter({ hasText: "Type a course name" })).toBeVisible();

  await page.getByTestId("core-input").fill(name);
  await page.getByTestId("core-submit").click();
  const card = page.getByTestId("core-item").filter({ hasText: name });
  await expect(card).toHaveCount(1);
  await expect(page.getByTestId("core-input")).toHaveValue("");

  await openCourse(page, name);
  await card.getByRole("button", { name: "Add manually" }).click();
  const form = card.getByRole("form", { name: "Add assessment" });
  await form.getByLabel("Name").fill("Midterm");
  await form.getByLabel("Weight (%)").fill("40,5");
  await form.getByRole("button", { name: "Add assessment" }).click();
  await expect(card.getByTestId("assessment-row").filter({ hasText: "Midterm" })).toContainText("40.5%");
  await form.getByRole("button", { name: "Final exam" }).click();
  await form.getByLabel("Weight (%)").fill("59,5");
  await form.getByLabel("Grade").fill("7,5");
  await form.getByRole("button", { name: "Add assessment" }).click();
  await expect(card.getByRole("button", { name: "Edit grade for Final exam" })).toBeVisible();
  await form.getByRole("button", { name: "Done" }).click();
  await expect(card.getByText("Weights: 100%")).toBeVisible();

  // Target: a preset and a custom value with a comma.
  await card.getByRole("button", { name: "8.0" }).click();
  await expect(card).toContainText("Target 8.0");
  const custom = card.getByLabel("Custom");
  await custom.fill("6,5");
  await custom.press("Enter");
  await expect(card).toContainText("Target 6.5");
  await page.reload();
  await expect(page.getByTestId("core-item").filter({ hasText: name })).toContainText("Target 6.5");

  // Credits are saved when you leave the field.
  const c2 = await openCourse(page, name);
  // No credits yet: a prompt, and the field only after "Enter manually".
  await expect(c2.getByLabel("Credits (ECTS)")).toHaveCount(0);
  await c2.getByRole("button", { name: "Enter manually" }).click();
  await c2.getByLabel("Credits (ECTS)").fill("6");
  await c2.getByLabel("Credits (ECTS)").press("Enter");
  await expect(c2.getByRole("region", { name: "Course details" })).toContainText("6 ECTS · entered by you");
  await expect(c2.getByLabel("Credits (ECTS)")).toHaveCount(0);

  // Close and open again.
  await c2.getByRole("button", { name: new RegExp(name) }).first().click();
  await expect(c2.getByTestId("assessment-row")).toHaveCount(0);
  await openCourse(page, name);
  await expect(c2.getByTestId("assessment-row")).toHaveCount(2);

  // Delete an assessment, then the course.
  await c2.getByRole("button", { name: "More for Midterm" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await c2.getByRole("button", { name: "Yes, delete" }).click();
  await expect(c2.getByTestId("assessment-row")).toHaveCount(1);
  await c2.getByRole("button", { name: "Delete course" }).click();
  await c2.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByTestId("core-item").filter({ hasText: name })).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("core-item").filter({ hasText: name })).toHaveCount(0);
});
