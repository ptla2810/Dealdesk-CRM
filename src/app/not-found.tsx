import Link from "next/link";

export default function RootNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link href="/" className="text-primary hover:underline">
        Go to the dashboard
      </Link>
    </div>
  );
}
