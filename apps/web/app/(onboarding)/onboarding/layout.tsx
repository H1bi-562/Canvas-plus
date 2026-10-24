// UC23 – full-page frame for the setup wizard. Outside the (dashboard) group on purpose,
// so the dashboard's "finish onboarding first" redirect cannot loop back here.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen flex items-start justify-center px-4 py-10 bg-[var(--cp-page)]">{children}</main>;
}
