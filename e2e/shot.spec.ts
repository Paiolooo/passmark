import { REPORTED_COURSE, openCourse, seedCourse } from "./helpers";
import { test, uniqueName } from "./fixtures";
const S = "/private/tmp/claude-501/-Users-User-passmark/ff5d1404-e9d1-45eb-aa41-b18aad6364a6/scratchpad";
test("shot", async ({ page, account }, info) => {
  const name = uniqueName("Shot");
  await seedCourse(account.db, name, [{ ...REPORTED_COURSE[0], grade: 6.5 }, ...REPORTED_COURSE.slice(1)]);
  await page.goto("/app");
  const card = await openCourse(page, name);
  await card.getByRole("button", { name: "Add grade for Assignment #1" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${S}/nv-${info.project.name}.png` });
});
