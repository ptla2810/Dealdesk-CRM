import { Workflow } from "lucide-react";
import { APP_NAME } from "@/lib/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5 text-sidebar-accent-foreground">
          <span className="grid size-9 place-items-center rounded-md bg-sidebar-primary">
            <Workflow className="size-5" />
          </span>
          <span className="text-lg font-semibold">{APP_NAME}</span>
        </div>
        <div className="max-w-md space-y-4">
          <h2 className="text-3xl font-semibold tracking-tight text-sidebar-accent-foreground">From first inquiry to delivered order.</h2>
          <p className="text-sidebar-foreground/70">
            Capture leads, run your pipeline, record meeting minutes, manage buyer accounts, support tickets and order delivery — in one workspace.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">© {new Date().getFullYear()} {APP_NAME}</p>
      </div>
      <div className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
