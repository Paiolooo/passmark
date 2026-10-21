import { test as base } from "@playwright/test";
import { expect, test } from "./fixtures";

// The landing page knows who you are, on the server: no flash of "Sign up free".

base("logged out: Sign up free is the only primary button, no My courses link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign up free" })).toHaveCount(1);
  await expect(page.getByText("Free · Private · 30-second setup")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to my courses" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "My courses" })).toHaveCount(0);
  await expect(page.getByTestId("logout")).toHaveCount(0);
});

test("logged in: Go to my courses and Welcome back, straight from the server", async ({ page }) => {
  // The HTML as sent, before any JavaScript runs.
  const html = await (await page.request.get("/")).text();
  expect(html).toContain("Go to my courses");
  expect(html).toContain("Welcome back");
  expect(html).not.toContain("Sign up free");

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign up free" })).toHaveCount(0);
  await expect(page.getByText("Welcome back")).toBeVisible();
  // Header: My courses next to the account pill, logout exactly as before.
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "My courses" })).toBeVisible();
  await expect(page.getByTestId("logout")).toBeVisible();

  await page.getByRole("link", { name: "Go to my courses" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(header.getByRole("link", { name: "My courses" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("logout")).toBeVisible();
  // Everything still fits the header on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

  await page.goto("/");
  await header.getByRole("link", { name: "My courses" }).click();
  await expect(page).toHaveURL(/\/app$/);
});
