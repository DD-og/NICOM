import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Link href="/" className="btn btn-primary mt-4">Go to dashboard</Link>
      </div>
    </main>
  );
}
