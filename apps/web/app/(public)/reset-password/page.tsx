import type { Metadata } from "next";
import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/reset-password-form";

// El token viaja en la URL: la página no se indexa ni se comparte.
export const metadata: Metadata = {
  title: "Restablecer contraseña · Pulse Stream",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  // `useSearchParams` en el form exige Suspense en el server component.
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
