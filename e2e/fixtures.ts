import { test as base } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiUser, login } from "./helpers";

type Account = { email: string; db: SupabaseClient; storageState: string };

/**
 * `test` with a logged-in account: one throwaway account per worker (signed up once, logged in
 * once through the real login form), so a full run stays far below Supabase's auth rate limits.
 */
export const test = base.extend<{ account: Account }, { workerAccount: Account }>({
  workerAccount: [
    // (Playwright's `use` callback is named `provide` here so lint doesn't take it for a React hook.)
    async ({ browser }, provide, workerInfo) => {
      const { email, db } = await apiUser(`w${workerInfo.workerIndex}`);
      const page = await browser.newPage({ baseURL: workerInfo.project.use.baseURL });
      await login(page, email);
      const storageState = workerInfo.project.outputDir + `/state-${workerInfo.workerIndex}.json`;
      await page.context().storageState({ path: storageState });
      await page.close();
      await provide({ email, db, storageState });
    },
    { scope: "worker" },
  ],
  storageState: async ({ workerAccount }, provide) => provide(workerAccount.storageState),
  account: async ({ workerAccount }, provide) => provide(workerAccount),
});

export { expect } from "@playwright/test";

/** A course name no other test uses. */
export const uniqueName = (base: string) => `${base} ${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
