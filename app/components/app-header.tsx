import { logout } from "@/app/actions";
import { config } from "@/lib/config";
import type { SessionUser } from "@/lib/types";
import { NavLink } from "./client";

export function AppHeader({ user, links }: { user: SessionUser; links: { href: string; label: string; exact?: boolean }[] }) {
  return (
    <header className="bg-[#1f3a68] text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 md:flex-nowrap">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-white text-sm font-bold text-[#1f3a68]">N</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">{config.conferenceName} Review Portal</div>
            <div className="text-xs text-white/70">Institute of Management, Nirma University</div>
          </div>
        </div>
        <nav className="order-last -mx-1 flex min-w-0 basis-full gap-1 overflow-x-auto md:order-none md:basis-auto md:flex-1">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href} exact={l.exact}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-white/70">{user.role === "master" ? "Master Admin" : "Faculty Reviewer"}</div>
          </div>
          <form action={logout}>
            <button className="rounded-md border border-white/30 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/10">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
