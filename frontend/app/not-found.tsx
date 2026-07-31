import Link from "next/link";

/**
 * Custom 404.
 *
 * Next's built-in not-found page styles itself and honours
 * `prefers-color-scheme`, so on a dark-mode machine it renders black — jarring
 * against a design with no dark variant. Overriding it is the only way to keep
 * 404s inside the design system.
 *
 * Deliberately vague: a teacher reaching another teacher's topic gets this page,
 * and "not found" must not become "found, but not yours".
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-muted-foreground">
          That page doesn&apos;t exist, or it isn&apos;t yours to see.
        </p>
        <Link
          href="/"
          className="mt-6 pressable inline-flex items-center justify-center rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Go to your home page
        </Link>
      </div>
    </div>
  );
}
