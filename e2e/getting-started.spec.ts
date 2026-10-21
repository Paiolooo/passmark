import { openCourse, seedCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// The getting-started checklist ticks itself, and goes away when done or dismissed.
test.beforeEach(async ({ account, page }) => {
  const { error } = await account.db.from("courses").delete().not("id", "is", null);
  if (error) throw error;
  await page.goto("/app");
  await page.evaluate(() => localStorage.clear());
});

test("ticks as you go, and disappears once all three are done", async ({ page, account }) => {
  const name = uniqueName("Steps");
  await seedCourse(account.db, name, [{ name: "Final", weight: 100 }]);
  await page.reload();
  const list = page.getByRole("region", { name: "Getting started" });
  await expect(list).toContainText("Import a syllabus (to do)");
  await expect(list).toContainText("Add your first grade (to do)");
  await expect(list).toContainText("Set your target grade (to do)");

  const course = await openCourse(page, name);
  // Choosing the target it already has (Pass 5.0) still counts as setting it.
  await course.getByRole("button", { name: "Pass 5.0" }).click();
  await expect(list).toContainText("Set your target grade (done)");
  await course.getByRole("button", { name: "Add grade for Final" }).click();
  await page.keyboard.type("6");
  await page.keyboard.press("Enter");
  await expect(list).toContainText("Add your first grade (done)");
  await expect(page.getByText("Saving…")).toHaveCount(0);
  // Step 1 is a syllabus import: mark this course as one, and all three are done.
  await account.db.from("courses").update({ source: "syllabus" }).eq("name", name);
  // The first visit that sees everything done says so once; after that it's gone.
  await page.reload();
  await expect(page.getByRole("region", { name: "Getting started" })).toContainText("You're all set");
  await page.reload();
  await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);
});

test("finishing the last step during the visit says so", async ({ page, account }) => {
  const name = uniqueName("Done");
  await seedCourse(account.db, name, [{ name: "Final", weight: 100, grade: 7 }]);
  await account.db.from("courses").update({ source: "syllabus" }).eq("name", name);
  await page.reload();
  const list = page.getByRole("region", { name: "Getting started" });
  await expect(list).toContainText("Set your target grade (to do)");
  const course = await openCourse(page, name);
  await course.getByRole("button", { name: "7.0" }).click();
  await expect(list).toContainText("You're all set");
  await page.reload();
  await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);
});

test("can be dismissed for good", async ({ page }) => {
  await page.reload();
  await page.getByRole("button", { name: "Dismiss getting started" }).click();
  await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("region", { name: "Getting started" })).toHaveCount(0);
});

test("each step takes you there", async ({ page, account }) => {
  const name = uniqueName("Go");
  await seedCourse(account.db, name, [{ name: "Final", weight: 100 }]);
  await page.reload();
  const list = page.getByRole("region", { name: "Getting started" });

  const chooser = page.waitForEvent("filechooser");
  await list.getByRole("button", { name: /Import a syllabus/ }).click();
  await chooser;

  await list.getByRole("button", { name: /Set your target grade/ }).click();
  await expect(page.getByRole("button", { name: "Pass 5.0" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Pass 5.0" })).toBeInViewport();

  await list.getByRole("button", { name: /Add your first grade/ }).click();
  await expect(page.getByRole("button", { name: "Add grade for Final" })).toBeFocused();
});

test("a brand-new account sees the syllabus import first, not the GPA box", async ({ page }) => {
  await page.reload();
  await expect(page.getByTestId("gpa-box")).toBeHidden();
  await expect(page.getByRole("button", { name: /Import your syllabus PDFs/ })).toBeVisible();
  await page.getByTestId("core-input").fill(uniqueName("First"));
  await page.getByTestId("core-submit").click();
  await expect(page.getByTestId("gpa-box")).toBeVisible();
});

