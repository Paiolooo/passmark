import { readFileSync } from "node:fs";
import { type Page, expect } from "@playwright/test";
import { type SupabaseClient, createClient } from "@supabase/supabase-js";

// Keys from .env.local (only the public URL and publishable key, same as the browser gets).
function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing from .env.local`);
  return line.slice(name.length + 1).trim().replace(/^"|"$/g, "");
}

export const PASSWORD = "e2e-Passw0rd!";

/** A unique throwaway email. Every test account matches e2e-%@passmark-test.dev (see e2e/cleanup.sql). */
export const testEmail = (tag: string) =>
  `e2e-${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@passmark-test.dev`;

/** Signs up a fresh account straight with Supabase and returns a client logged in as it. */
export async function apiUser(tag: string): Promise<{ email: string; db: SupabaseClient }> {
  const db = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { persistSession: false },
  });
  const email = testEmail(tag);
  const { data, error } = await db.auth.signUp({ email, password: PASSWORD });
  if (error || !data.session) throw new Error(`signup failed: ${error?.message ?? "no session"}`);
  return { email, db };
}

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL("**/app");
}

type Seed = {
  name: string;
  weight: number;
  grade?: number | null;
  min_grade?: number | null;
  best_of?: number | null;
  parts?: { name: string; weight: number; grade?: number | null }[];
};

/** Creates a course with assessments (and parts) for the logged-in API user. */
export async function seedCourse(db: SupabaseClient, name: string, rows: Seed[], target = 5) {
  const { data: course, error } = await db.from("courses").insert({ name, target_grade: target }).select("id").single();
  if (error) throw error;
  for (const [position, r] of rows.entries()) {
    const { data: parent, error: e } = await db
      .from("assessments")
      .insert({
        course_id: course.id,
        name: r.name,
        weight: r.weight,
        grade: r.grade ?? null,
        min_grade: r.min_grade ?? null,
        best_of: r.best_of ?? null,
        position,
      })
      .select("id")
      .single();
    if (e) throw e;
    if (r.parts?.length) {
      const { error: e2 } = await db.from("assessments").insert(
        r.parts.map((p, i) => ({
          course_id: course.id,
          parent_id: parent.id,
          name: p.name,
          weight: p.weight,
          grade: p.grade ?? null,
          position: i,
        })),
      );
      if (e2) throw e2;
    }
  }
  return course.id as string;
}

/** The course from the bug report: four assessments, the last one split into two parts. */
export const REPORTED_COURSE: Seed[] = [
  { name: "Final Exam", weight: 40, min_grade: 4 },
  { name: "Class Participation", weight: 15 },
  { name: "Intermediate Tests", weight: 25 },
  {
    name: "Assignments",
    weight: 20,
    parts: [
      { name: "Assignment #1", weight: 5 },
      { name: "Assignment #2", weight: 15 },
    ],
  },
];

export async function openCourse(page: Page, name: string) {
  const card = page.getByTestId("core-item").filter({ hasText: name });
  const toggle = card.getByRole("button", { name: new RegExp(name) }).first();
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return card;
}
