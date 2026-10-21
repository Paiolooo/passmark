import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { apiUser, seedCourse } from "./helpers";

// Row Level Security, end to end: one student's data is invisible to another student and to
// anyone logged out (grading contract: nobody can read anything without logging in).
const env = (name: string) =>
  readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith(`${name}=`))!.slice(name.length + 1).trim();

test("a second account can't see, change or delete the first account's courses", async ({}, info) => {
  test.skip(info.project.name !== "desktop", "data check: once is enough");
  const a = await apiUser("iso-a");
  const b = await apiUser("iso-b");
  const courseId = await seedCourse(a.db, "Private course", [{ name: "Final", weight: 100, grade: 7 }]);
  await a.db.from("past_courses").insert({ name: "Private past", semester_label: "25/26 · 1st semester", credits: 6, grade: 9, counts_in_gpa: true, position: 0 });

  // B sees nothing of A's.
  expect((await b.db.from("courses").select("id").eq("id", courseId)).data).toEqual([]);
  expect((await b.db.from("assessments").select("id").eq("course_id", courseId)).data).toEqual([]);
  expect((await b.db.from("past_courses").select("id").eq("name", "Private past")).data).toEqual([]);

  // B can't change or delete it either.
  await b.db.from("assessments").update({ grade: 1 }).eq("course_id", courseId);
  await b.db.from("courses").delete().eq("id", courseId);
  const still = await a.db.from("courses").select("id, assessments(grade)").eq("id", courseId).single();
  expect(still.data?.assessments).toEqual([{ grade: 7 }]);

  // Logged out: nothing at all.
  const anon = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), { auth: { persistSession: false } });
  for (const table of ["courses", "assessments", "past_courses", "past_semesters", "ranking_reference"]) {
    const { data } = await anon.from(table).select("*").limit(1);
    expect(data ?? [], table).toEqual([]);
  }
});
