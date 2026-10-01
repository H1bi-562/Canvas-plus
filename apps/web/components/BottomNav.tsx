import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Shield, Calendar, User, BarChart3 } from "lucide-react";

const links = [
  { href: "/assignments", label: "Home", Icon: Home },
  { href: "/focus", label: "Focus", Icon: Shield },
  { href: "/analytics", label: "Analytics", Icon: BarChart3 },
  { href: "/calendar", label: "Calendar", Icon: Calendar },
  { href: "/settings", label: "Profile", Icon: User }
];

export default function BottomNav({ darkMode }: { darkMode: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className={"border-t px-6 py-3 shadow-sm " + (darkMode ? "bg-[var(--cp-card)] border-gray-700" : "bg-white border-gray-200")}>
      <div className="max-w-md mx-auto flex justify-around">
        {links.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={"flex flex-col items-center gap-1 " + (pathname === href ? "text-blue-600" : darkMode ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700")}>
            <Icon className="w-6 h-6" />
            <span className="text-xs">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
