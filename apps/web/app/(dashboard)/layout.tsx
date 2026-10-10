import { auth } from "@canvasplus/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DashboardProvider from "./_components/DashboardProvider";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const name = session.user.name.split(" ")[0] || session.user.email.split("@")[0];
  return <DashboardProvider initialName={name} userId={session.user.id}>{children}</DashboardProvider>;
}
