import { expect, test } from "@playwright/test";
import { PASSWORD, testEmail } from "./helpers";

// The grading contract, end to end, like the grading bot: a stranger on the public URL.

test("landing page is public and leads to sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByTestId("logout")).toHaveCount(0);
  // The landing demo slider works and keeps one decimal.
  const demo = page.getByRole("slider").first();
  await demo.fill("9");
  await expect(page.locator("output").first()).toHaveText("9.0");
  await page.getByRole("link", { name: /sign up|get started|create/i }).first().click();
  await expect(page).toHaveURL(/\/signup$/);
});

test("logged out: /app and /gpa send you to /login", async ({ page }) => {
  for (const path of ["/app", "/gpa"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("sign up, add an item, log out, log in again", async ({ page }) => {
  const email = testEmail("auth");
  await page.goto("/signup");
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("signup-password").fill(PASSWORD);
  await page.getByTestId("signup-submit").click();
  await page.waitForURL("**/app");

  // core-input is a text field; typing only there and clicking core-submit saves an item.
  const input = page.getByTestId("core-input");
  expect(await input.evaluate((el) => el.tagName === "TEXTAREA" || (el as HTMLInputElement).type === "text")).toBe(true);
  await input.fill("QA-7F3K2A grading bot test");
  await page.getByTestId("core-submit").click();
  await expect(page.getByTestId("core-item").filter({ hasText: "QA-7F3K2A grading bot test" })).toHaveCount(1);
  await page.reload();
  await expect(page.getByTestId("core-item").filter({ hasText: "QA-7F3K2A grading bot test" })).toHaveCount(1);

  // logout on every logged-in page
  for (const path of ["/", "/app", "/gpa"]) {
    await page.goto(path);
    await expect(page.getByTestId("logout"), `logout on ${path}`).toBeVisible();
  }
  await page.getByTestId("logout").click();
  await page.waitForURL((u) => u.pathname === "/");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);

  // wrong password: a clear error, no redirect
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill("wrong-password-1");
  await page.getByTestId("login-submit").click();
  await expect(page.getByRole("alert").filter({ hasText: /password|email|credentials/i })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/app");
  await expect(page.getByTestId("core-item").filter({ hasText: "QA-7F3K2A grading bot test" })).toHaveCount(1);
});
