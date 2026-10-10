import { AppHeader } from "@/app/components/app-header";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function FacultyLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("faculty");
  return (
    <>
      <AppHeader user={user} links={[{ href: "/faculty", label: "My Papers", exact: true }]} />
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </>
  );
}
