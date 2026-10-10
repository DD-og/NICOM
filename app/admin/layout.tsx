import { AppHeader } from "@/app/components/app-header";
import { VersionTag } from "@/app/components/version-tag";
import { requireUser } from "@/lib/auth";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("master");
  return (
    <>
      <AppHeader
        user={user}
        links={[
          { href: "/admin", label: "Overview", exact: true },
          { href: "/admin/papers", label: "Papers" },
          { href: "/admin/distribute", label: "Distribute" },
          { href: "/admin/faculty", label: "Faculty" },
          { href: "/admin/decisions", label: "Decisions & Emails" },
        ]}
      />
      {config.backend === "local" && (
        <div className="border-b border-line bg-warn-soft px-4 py-1.5 text-center text-xs text-warn">
          Demo mode: dummy data, stored locally. Connect the Google Sheet and Google sign-in to go live (see README).
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
      <VersionTag />
    </>
  );
}
