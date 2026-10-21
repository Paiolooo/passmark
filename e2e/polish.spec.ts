import { type Page, expect as baseExpect, test as base } from "@playwright/test";
import { PASSWORD, apiUser, login, openCourse, seedCourse } from "./helpers";
import { expect, test, uniqueName } from "./fixtures";

// Polish pass: slider focus, below-minimum grades, link previews, icons, 404, privacy, account.

/** Click a slider, press Right 5 times: +0.5, and focus stays on it. */
async function arrowKeysAfterClick(page: Page, slider: ReturnType<Page["getByRole"]>) {
  await slider.click();
  await expect(slider).toBeFocused();
  const before = Number(await slider.inputValue());
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight");
  await expect(slider).toBeFocused();
  expect(Number(await slider.inputValue())).toBeCloseTo(Math.min(10, before + 0.5), 5);
}

base("landing demo slider keeps focus after a click", async ({ page }) => {
  await page.goto("/");
  await arrowKeysAfterClick(page, page.getByRole("slider").first());
});

test("planner slider keeps focus after a click", async ({ page, account }) => {
  const name = uniqueName("Focus");
  await seedCourse(account.db, name, [{ name: "Final", weight: 50 }, { name: "Mid", weight: 30 }, { name: "Work", weight: 20 }], 6);
  await page.goto("/app");
  const card = await openCourse(page, name);
  await arrowKeysAfterClick(page, card.getByRole("slider", { name: "Plan for Mid" }));
});

base("landing demo below the minimum: the real grade and why it doesn't pass", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByRole("region", { name: "Corporate Finance" });
  await demo.getByRole("slider").fill("2");
  await baseExpect(demo).toContainText("Not passed: below the 4.0 minimum on the Final exam");
  // (15×8 + 30×6.5 + 20×7.5 + 35×2) / 100 = 5.35 → shown 5.3, never 0.0
  await baseExpect(demo.getByRole("img", { name: /Projected final grade/ })).toHaveAttribute("aria-label", /Projected final grade: 5\.3 out of 10/);
});

test("a course below a minimum shows its weighted grade, not 0.0", async ({ page, account }) => {
  const name = uniqueName("Min");
  await seedCourse(account.db, name, [
    { name: "Final exam", weight: 40, grade: 3, min_grade: 4 },
    { name: "Coursework", weight: 60, grade: 8 },
  ]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  const result = card.getByRole("region", { name: "Result" });
  await expect(result).toContainText("Not passed: below the 4.0 minimum on the Final exam");
  await expect(result).toContainText("6.0");
  await expect(result).not.toContainText("0.0 ");
});

base("link previews, icons and the web app manifest", async ({ page, request }) => {
  await page.goto("/");
  const meta = (sel: string) => page.locator(sel).first().getAttribute("content");
  baseExpect(await meta('meta[property="og:title"]')).toBe("PassMark — Grade & GPA calculator for IE students");
  baseExpect(await meta('meta[property="og:description"]')).toMatch(/^Import your syllabus, add grades as they come in/);
  baseExpect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  baseExpect(await meta('meta[property="og:image:width"]')).toBe("1200");
  baseExpect(await meta('meta[property="og:image:height"]')).toBe("630");

  // og:image is absolute (the live site): fetch the same path from the server under test.
  const ogUrl = new URL((await meta('meta[property="og:image"]'))!);
  const og = await request.get(ogUrl.pathname + ogUrl.search);
  baseExpect(og.status()).toBe(200);
  baseExpect(og.headers()["content-type"]).toBe("image/png");

  for (const path of ["/favicon.ico", "/icon.svg", "/apple-icon.png", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"])
    baseExpect((await request.get(path)).status(), path).toBe(200);
  await baseExpect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const manifest = await (await request.get((await page.locator('link[rel="manifest"]').getAttribute("href"))!)).json();
  baseExpect(manifest).toMatchObject({ short_name: "PassMark", theme_color: "#0F5C4A", display: "standalone" });
  baseExpect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
});

base("404: a styled page with the way back home", async ({ page }) => {
  const res = await page.goto("/this-does-not-exist");
  baseExpect(res?.status()).toBe(404);
  await baseExpect(page.getByRole("heading", { level: 1, name: "This page doesn't exist" })).toBeVisible();
  await page.getByRole("link", { name: "Back to the home page" }).click();
  await baseExpect(page).toHaveURL(/\/$/);
});

test("404 when logged in: back to my courses, logout still there", async ({ page }) => {
  await page.goto("/this-does-not-exist");
  await expect(page.getByTestId("logout")).toBeVisible();
  await page.getByRole("link", { name: "Go to my courses" }).click();
  await expect(page).toHaveURL(/\/app$/);
});

base("privacy page from the footer; signup shows what you get", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await baseExpect(page).toHaveURL(/\/privacy$/);
  for (const h of ["What PassMark stores", "Your PDFs never leave your device", "Only you can see your data", "Export or delete everything"])
    await baseExpect(page.getByRole("heading", { name: h })).toBeVisible();

  await page.goto("/signup");
  const ticks = page.getByRole("list", { name: "What you get" });
  for (const t of ["See the grade you need on every exam", "Your GPA, live", "No email confirmation needed"])
    await baseExpect(ticks.getByText(t)).toBeVisible();
  for (const id of ["signup-email", "signup-password", "signup-submit"]) await baseExpect(page.getByTestId(id)).toBeVisible();
});

base("landing subheadline stays beside the example cards (about 60 characters a line)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const sub = await page.getByText(/^Import your syllabus, add grades/).boundingBox();
  const cards = await page.locator("main section").first().locator("figure").boundingBox();
  baseExpect(sub!.x + sub!.width).toBeLessThanOrEqual(cards!.x);
});

test("account: logout visible, export my data, password checks, delete asks first", async ({ page, account }) => {
  await seedCourse(account.db, uniqueName("Export"), [{ name: "Final", weight: 100, grade: 7 }]);
  await page.goto("/app");
  await page.getByRole("link", { name: /^Account/ }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId("logout")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^passmark-data-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await (await import("node:fs/promises")).readFile((await file.path())!, "utf8"));
  expect(data.courses.length).toBeGreaterThan(0);
  expect(data.courses.some((c: { assessments: { grade: number }[] }) => c.assessments.some((a) => Number(a.grade) === 7))).toBe(true);

  await page.getByLabel("New password", { exact: true }).fill("abc12345");
  await page.getByLabel("Repeat new password").fill("different1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();

  await page.getByRole("button", { name: "Delete my account…" }).click();
  const confirm = page.getByRole("button", { name: "Delete my account", exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Type DELETE/).fill("delete");
  await expect(confirm).toBeEnabled();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
});

base("account: change the password, then delete the account", async ({ browser }) => {
  // Its own account: this one really goes away.
  const { email } = await apiUser("delete");
  const page = await browser.newPage();
  await login(page, email);
  await page.goto("/account");
  await page.getByLabel("New password", { exact: true }).fill(`${PASSWORD}-2`);
  await page.getByLabel("Repeat new password").fill(`${PASSWORD}-2`);
  await page.getByRole("button", { name: "Change password" }).click();
  await baseExpect(page.getByText("Password changed.")).toBeVisible();

  await page.getByRole("button", { name: "Delete my account…" }).click();
  await page.getByLabel(/Type DELETE/).fill("DELETE");
  await page.getByRole("button", { name: "Delete my account", exact: true }).click();
  // Until supabase/add-delete-account.sql is run, it says so instead of half-deleting anything.
  const outcome = await Promise.race([
    page.waitForURL((u) => u.pathname === "/").then(() => "deleted"),
    page.getByText("Deleting accounts isn't available yet").waitFor().then(() => "not set up"),
  ]);
  if (outcome === "deleted") {
    await page.goto("/login");
    await page.getByTestId("login-email").fill(email);
    await page.getByTestId("login-password").fill(`${PASSWORD}-2`);
    await page.getByTestId("login-submit").click();
    await baseExpect(page.getByRole("alert").filter({ hasText: /password|email|credentials/i })).toBeVisible();
  } else {
    await baseExpect(page.getByTestId("logout")).toBeVisible();
  }
  await page.close();
});
