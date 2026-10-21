import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountApp } from "@/components/AccountApp";
import { getCurrentUser } from "@/lib/supabase/user";

export const metadata: Metadata = { title: "Account · PassMark" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <AccountApp email={user.email} />;
}
