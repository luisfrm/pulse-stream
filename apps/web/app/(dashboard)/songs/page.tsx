import type { Metadata } from "next";
import Link from "next/link";

import { getMe } from "@/lib/api-server";

import SongsManager from "./songs-manager";

export const metadata: Metadata = { title: "Canciones" };

export default async function SongsPage() {
  const user = await getMe();
  const isAdmin = Boolean(
    user && (user.is_superuser || user.role === "admin")
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold">Canciones</h1>
        {isAdmin && (
          <Link
            href="/dashboard/songs/new"
            className="rounded-pill bg-brand-400 px-5 py-2.5 font-semibold text-bg-base transition-colors hover:bg-brand-200"
          >
            + Subir canción
          </Link>
        )}
      </div>
      <SongsManager isAdmin={isAdmin} />
    </div>
  );
}
