import { auth } from "@canvasplus/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getOnboarding } from "@canvasplus/database/queries/onboarding";
import { loadGate, needsOnboarding, needsWalkthrough, type OnboardingState } from "@/lib/onboarding";
import DashboardProvider from "./_components/DashboardProvider";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  // UC23: students who have not finished the setup wizard see it first. redirect() stays outside any try.
  const progress = await loadGate(() => getOnboarding(session.user.id) as Promise<OnboardingState>);
  if (needsOnboarding(progress)) redirect("/onboarding");
  const name = session.user.name.split(" ")[0] || session.user.email.split("@")[0];
  return <DashboardProvider initialName={name} userId={session.user.id} walkthroughPending={needsWalkthrough(progress)}>{children}</DashboardProvider>;
}
