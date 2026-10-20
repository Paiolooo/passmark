import { redirect } from "next/navigation";

// GPA now lives on the courses page: /gpa opens it there, with "GPA details" open.
export default function GpaPage() {
  redirect("/app?gpa=1");
}
