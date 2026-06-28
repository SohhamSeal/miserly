import type { SVGProps } from "react";
import { BookOpen, Shrink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tip } from "@/components/ui/tooltip";
import { SettingsModal } from "@/components/settings/SettingsModal";

function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.79 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.39-5.25 5.68.42.36.79 1.08.79 2.18 0 1.58-.01 2.85-.01 3.24 0 .31.21.68.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-900/40">
            <Shrink className="h-5 w-5 text-white" />
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="text-[15px] font-semibold tracking-tight">miserly</h1>
              <Badge variant="outline" className="hidden sm:inline-flex">
                studio
              </Badge>
            </div>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Compresses your prompts before they reach the LLM — so you spend fewer tokens.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Tip content="View the source on GitHub">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => e.preventDefault()}
              className="text-muted-foreground"
            >
              <GithubIcon />
              <span className="hidden md:inline">GitHub</span>
            </Button>
          </Tip>
          <Tip content="Documentation — see the README">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => e.preventDefault()}
              className="text-muted-foreground"
            >
              <BookOpen />
              <span className="hidden md:inline">Docs</span>
            </Button>
          </Tip>
          <SettingsModal />
        </div>
      </div>
    </header>
  );
}
