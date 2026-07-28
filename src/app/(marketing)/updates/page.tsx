import type { Metadata } from "next";

import {
  PublicFooter,
  PublicHeader,
} from "@/components/public-page-chrome";
import { UpdatesReleaseList } from "@/components/updates-release-list";
import { Badge } from "@/components/ui/badge";
import { appVersion, publicReleaseEntries } from "@/lib/release-notes";

export const metadata: Metadata = {
  title: "What's New",
  description:
    "Release notes for MovingManifest product updates, fixes, and upgrades.",
};

export default function UpdatesPage() {
  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground">
      <PublicHeader />
      <section className="border-b border-border">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <Badge variant="secondary" className="mb-5">
            Release notes
          </Badge>
          <h1 className="text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
            What&apos;s New
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground">
            See what MovingManifest can do now, what was fixed, and what became
            easier or safer. Choose a quick scan or learn why each change matters.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Current application version:{" "}
            <span className="font-mono text-foreground">v{appVersion}</span>
          </p>
        </div>
      </section>

      <section aria-label="MovingManifest release history">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <UpdatesReleaseList entries={publicReleaseEntries} />
        </div>
      </section>
      <PublicFooter />
    </main>
  );
}
