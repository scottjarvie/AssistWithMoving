import { clerkSetup } from "@clerk/testing/playwright";

export default async function globalSetup() {
  try {
    await clerkSetup();
  } catch (error) {
    if (process.env.E2E_CLERK_USER_EMAIL) {
      throw error;
    }
    console.warn(
      "Clerk testing setup skipped; set Clerk env vars and E2E_CLERK_USER_EMAIL for authenticated e2e flows."
    );
  }
}
