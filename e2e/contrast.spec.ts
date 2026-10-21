import { expect, test } from "./fixtures";
import { seedCourse } from "./helpers";

// WCAG 2.1 AA text contrast (4.5:1, 3:1 for large text) of every visible text node, in light and
// dark mode: the landing page, /app with the GPA box and its tooltip, and GPA details.

/** Returns the text nodes below AA as `ratio "text"` strings (runs in the page). */
function check(): string[] {
  type Rgba = { r: number; g: number; b: number; a: number };
  // Any CSS colour (oklab, color(srgb …), rgba) → rgba, via one canvas pixel.
  const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): Rgba => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgba(0,0,0,0)";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  };
  const channel = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = ({ r, g, b }: Rgba) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const background = (el: Element | null): Rgba => {
    for (let e = el; e; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c.a > 0.5) return c;
    }
    return rgba(getComputedStyle(document.body).backgroundColor);
  };

  const failures: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const text = walker.currentNode.textContent?.trim() ?? "";
    const el = walker.currentNode.parentElement;
    if (!text || !el || el.closest(".sr-only")) continue;
    const style = getComputedStyle(el);
    if (el.getBoundingClientRect().width < 2 || style.visibility === "hidden") continue;
    const [hi, lo] = [luminance(rgba(style.color)), luminance(background(el))].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(style.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) failures.push(`${ratio.toFixed(2)} "${text.slice(0, 40)}"`);
  }
  return failures;
}

for (const scheme of ["light", "dark"] as const) {
  test(`contrast: public pages (${scheme})`, async ({ browser }) => {
    const page = await browser.newPage({ colorScheme: scheme, storageState: undefined });
    for (const path of ["/", "/signup", "/login", "/privacy", "/no-such-page"]) {
      await page.goto(path);
      expect(await page.evaluate(check), path).toEqual([]);
    }
    // The demo below its minimum (red status).
    await page.goto("/");
    await page.getByRole("slider").first().fill("2");
    expect(await page.evaluate(check)).toEqual([]);
    await page.close();
  });

  test(`contrast: account (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/account");
    await page.getByRole("button", { name: "Delete my account…" }).click();
    expect(await page.evaluate(check)).toEqual([]);
  });

  test(`contrast: /app and GPA details (${scheme})`, async ({ page, account }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await account.db.from("past_courses").insert([
      { name: "Contrast Micro", semester_label: "24/25 · 1st semester", credits: 6, grade: 9, counts_in_gpa: true, position: 0 },
    ]);
    await seedCourse(account.db, "Contrast course", [{ name: "Final", weight: 100 }]);
    await page.goto("/app");
    expect(await page.evaluate(check)).toEqual([]);
    await page.getByTestId("gpa-box").getByRole("button", { name: "About the live GPA" }).click();
    expect(await page.evaluate(check)).toEqual([]);
    await page.getByTestId("gpa-box").getByRole("button", { name: "GPA details" }).click();
    await expect(page.getByRole("dialog", { name: "GPA details" })).toBeVisible();
    await page.waitForTimeout(400); // the sheet's entrance animation
    expect(await page.evaluate(check)).toEqual([]);
  });
}
