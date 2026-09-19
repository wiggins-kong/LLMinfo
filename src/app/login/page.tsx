import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { bootstrap } from "@/lib/bootstrap";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "登录 · LLMinfo" };

export default async function LoginPage() {
  await bootstrap();
  const user = await getSessionUser();
  if (user) redirect("/");
  return <LoginForm />;
}
