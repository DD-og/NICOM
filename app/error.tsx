"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="max-w-md">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          The portal couldn&apos;t load its data. If this is a new deployment, check that the Apps Script web app is deployed
          with access “Anyone” and that APPS_SCRIPT_URL / APPS_SCRIPT_SECRET match (README → Deploy). The exact error is in the
          hosting logs{error.digest ? ` (reference ${error.digest})` : ""}.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button onClick={reset} className="btn btn-primary">Try again</button>
          <a href="/" className="btn btn-secondary">Go to dashboard</a>
        </div>
      </div>
    </main>
  );
}
