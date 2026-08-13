import type { Metadata } from "next";

import { PublicShareViewer } from "@/components/public-share-viewer";

export const metadata: Metadata = {
  title: "Shared Assist With Moving packet",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <PublicShareViewer token={token} />;
}
