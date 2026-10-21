import { redirect } from "next/navigation";

/** La raíz del panel es el dashboard de administración. */
export default function PanelRootPage() {
  redirect("/panel");
}
