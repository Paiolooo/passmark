import type { Locator, Page } from "@playwright/test";
import { openCourse, seedCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// The planner: drag one row and the open rows follow so the plan still reaches the target.

const COURSE = [
  { name: "Final Exam", weight: 40, min_grade: 5 },
  { name: "Midterm", weight: 25 },
  { name: "Project", weight: 20 },
  { name: "Participation", weight: 15 },
];
const MIN: Record<string, number> = { "Final Exam": 5 };

async function setup(page: Page, db: Parameters<typeof seedCourse>[0], target = 7, rows = COURSE) {
  const name = uniqueName("Plan");
  await seedCourse(db, name, rows, target);
  await page.goto("/app");
  return openCourse(page, name);
}

const slider = (card: Locator, n: string) => card.getByRole("slider", { name: `Plan for ${n}` });
const projected = async (card: Locator) =>
  Number((await card.getByTestId("projected-grade").locator(".sr-only").textContent())!.trim());

/** Every slider stays between its minimum and 10, and the plan adds up to what's shown. */
async function checkPlan(card: Locator, names = COURSE.map((r) => r.name), earned = 0) {
  let sum = earned;
  for (const r of COURSE.filter((x) => names.includes(x.name))) {
    const v = Number(await slider(card, r.name).inputValue());
    expect(v, r.name).toBeGreaterThanOrEqual((MIN[r.name] ?? 0) - 1e-9);
    expect(v, r.name).toBeLessThanOrEqual(10);
    sum += v * r.weight;
  }
  const p = await projected(card);
  expect(Number.isFinite(p)).toBe(true);
  // Shown slider values are rounded to the slider step; the projection is within a step of them.
  expect(Math.abs(p - sum / 100)).toBeLessThan(0.11);
  return p;
}

test("drag rows in many orders: plan stays in range and on target while reachable", async ({ page, account }) => {
  const card = await setup(page, account.db);
  await expect(card.getByTestId("projected-grade")).toContainText("7.0");
  const orders = [
    ["Final Exam", 9],
    ["Midterm", 10],
    ["Project", 2],
    ["Participation", 10],
    ["Final Exam", 5],
    ["Midterm", 0],
    ["Project", 10],
    ["Final Exam", 10],
  ] as const;
  for (const [n, v] of orders) {
    await slider(card, n).fill(String(v));
    const p = await checkPlan(card);
    // The row you moved keeps your value (never below its minimum).
    expect(Number(await slider(card, n).inputValue())).toBeCloseTo(Math.max(v, MIN[n] ?? 0), 5);
    if (p < 6.95) await expect(card.getByText(/not reachable|can't|below/i).first()).toBeVisible();
  }
});

test("everything at 10 and at the minimum", async ({ page, account }) => {
  const card = await setup(page, account.db);
  for (const n of ["Final Exam", "Midterm", "Project"]) await slider(card, n).fill("10");
  await checkPlan(card);
  // The last open row moves too, and the others give way to keep the plan on target.
  await slider(card, "Participation").fill("10");
  expect(Number(await slider(card, "Participation").inputValue())).toBe(10);
  expect(await checkPlan(card)).toBeGreaterThanOrEqual(7);

  // Final at its minimum: the slider stops at 5.
  await slider(card, "Final Exam").fill("0");
  expect(Number(await slider(card, "Final Exam").inputValue())).toBe(5);
  for (const n of ["Midterm", "Project", "Participation"]) await slider(card, n).fill("0");
  await checkPlan(card);
  // Keyboard: Home/End respect the minimum and 10.
  await slider(card, "Final Exam").focus();
  await page.keyboard.press("Home");
  expect(Number(await slider(card, "Final Exam").inputValue())).toBe(5);
  await page.keyboard.press("End");
  expect(Number(await slider(card, "Final Exam").inputValue())).toBe(10);
  await checkPlan(card);
});

test("a pinned row stays put while others move", async ({ page, account }) => {
  const card = await setup(page, account.db);
  await slider(card, "Midterm").fill("8");
  await card.getByRole("button", { name: "More for Midterm" }).click();
  await page.getByRole("menuitem", { name: "Pin plan" }).click();
  await expect(card.getByTestId("assessment-row").filter({ hasText: "Midterm" })).toContainText("Pinned");
  for (const [n, v] of [["Final Exam", 9], ["Project", 3], ["Participation", 10], ["Final Exam", 5]] as const) {
    await slider(card, n).fill(String(v));
    expect(Number(await slider(card, "Midterm").inputValue()), `after ${n}`).toBeCloseTo(8, 5);
    await checkPlan(card);
  }
  await card.getByRole("button", { name: "More for Midterm" }).click();
  await page.getByRole("menuitem", { name: "Unpin plan" }).click();
  await expect(card.getByTestId("assessment-row").filter({ hasText: "Midterm" })).not.toContainText("Pinned");
});

test("changing the target re-fits the plan; a grade added keeps the plan working", async ({ page, account }) => {
  const card = await setup(page, account.db, 5);
  await expect(card.getByTestId("projected-grade")).toContainText("5.0");
  await card.getByRole("button", { name: "9.0" }).click();
  await expect(card.getByTestId("projected-grade")).toContainText("9.0");
  await checkPlan(card);
  await card.getByRole("button", { name: "Add grade for Midterm" }).click();
  await card.getByRole("textbox", { name: "Grade for Midterm" }).fill("10");
  await card.getByRole("textbox", { name: "Grade for Midterm" }).press("Enter");
  await expect(slider(card, "Midterm")).toHaveCount(0);
  await expect(card.getByTestId("projected-grade")).toContainText("9.0");
  await checkPlan(card, ["Final Exam", "Project", "Participation"], 10 * 25);
  // Only one row left to plan: it shows what you need, no slider juggling.
  for (const n of ["Project", "Participation"]) {
    await card.getByRole("button", { name: `Add grade for ${n}` }).click();
    await card.getByRole("textbox", { name: `Grade for ${n}` }).fill("8");
    await card.getByRole("textbox", { name: `Grade for ${n}` }).press("Enter");
  }
  await expect(card.getByTestId("assessment-row").filter({ hasText: "Final Exam" })).toContainText("Need");
});
