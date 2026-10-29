import { auth } from "@canvasplus/auth/server";
import { getOnboarding } from "@canvasplus/database/queries/onboarding";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { needsOnboarding, type OnboardingState } from "@/lib/onboarding";
import OnboardingWizard from "./_components/OnboardingWizard";

// UC23 – the setup wizard. The checks live here, not in layout.tsx, because a layout cannot pass data to its page.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const state = (await getOnboarding(session.user.id)) as OnboardingState;
  if (!needsOnboarding(state)) redirect("/assignments");
  // Google's consent screen sends the student back here with ?google=connected|error.
  const { google } = await searchParams;
  const googleResult = google === "connected" || google === "error" ? google : null;
  return <OnboardingWizard userId={session.user.id} initialState={state} googleResult={googleResult} />;
}
