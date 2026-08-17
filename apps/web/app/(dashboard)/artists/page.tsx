import type { Metadata } from "next";

import { getMe } from "@/lib/api-server";

import ArtistsManager from "./artists-manager";

export const metadata: Metadata = { title: "Artistas" };

export default async function ArtistsPage() {
  const user = await getMe();
  const isAdmin = Boolean(
    user && (user.is_superuser || user.role === "admin")
  );

  return <ArtistsManager isAdmin={isAdmin} />;
}
