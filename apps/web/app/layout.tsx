import "./globals.css";

export const metadata = { title: "CanvasPlus", description: "Plan coursework and focused study" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
