"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChefHat, Home, SlidersHorizontal } from "lucide-react";

const TABS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/kitchen", label: "Kitchen", Icon: ChefHat },
  { href: "/control", label: "Controls", Icon: SlidersHorizontal },
];

/** Bottom tab bar (phones), red when active, like the DoorDash app. */
export function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto flex max-w-md">
        {TABS.map(({ href, label, Icon }) => {
          const active = path === href;
          return (
            <Link key={href} href={href} className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${active ? "text-dd" : "text-sub"}`}>
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
