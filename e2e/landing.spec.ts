import { expect, test } from "@playwright/test";

// The first screen must say what PassMark is, who it's for and what to click, without scrolling.
for (const [width, height] of [[1280, 800], [375, 667]] as const) {
  test(`first screen at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page).toHaveTitle("PassMark — Grade & GPA calculator for IE students");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      "PassMark — Grade & GPA calculator for IE students",
    );

    const hero = page.locator("main section").first();
    const mustSee = [
      hero.getByText("Grade & GPA calculator for IE University students"),
      page.getByRole("heading", { level: 1, name: "Know the grade you need to pass — and your GPA, live." }),
      hero.getByText(/^Import your syllabus, add grades as they come in/),
      hero.getByRole("link", { name: "Sign up free" }),
      hero.getByText("Free · Private · 30-second setup"),
      hero.getByText("Corporate Finance", { exact: true }),
      hero.getByText(/^Semester GPA/),
    ];
    for (const el of mustSee) {
      await expect(el).toBeVisible();
      const box = (await el.boundingBox())!;
      expect(box.y + box.height, (await el.textContent()) ?? "").toBeLessThanOrEqual(height);
    }
    // One primary action; "Log in" is a small text link.
    await expect(page.getByRole("link", { name: "Sign up free" })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    // No sideways scrolling.
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await hero.getByRole("link", { name: "Sign up free" }).click();
    await expect(page).toHaveURL(/\/signup$/);
  });
}

test("below the fold: what you can do, demo, how it works, FAQ", async ({ page }) => {
  await page.goto("/");
  const features = page.getByRole("region", { name: "What you can do" });
  for (const t of ["See the grade you need", "Import your syllabus", "Track your GPA in real time", "Plan and predict"])
    await expect(features.getByRole("heading", { name: t })).toBeVisible();
  await expect(page.getByRole("region", { name: "Try it now" }).getByRole("slider")).toBeVisible();
  await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Questions" })).toBeVisible();
  await expect(page.getByText("Not affiliated with IE University")).toBeVisible();
});
