import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { bootstrap } from "@/lib/bootstrap";
import { Dashboard } from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Guarantees the admin account and the first snapshot exist before the UI
  // renders, so a fresh container is usable on the very first request.
  await bootstrap();

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <Dashboard user={{ email: user.email, name: user.name }} />;
}
