import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { Panel } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an account to save and re-edit your avatars.",
};

export default async function SignUpPage() {
  if ((await auth())?.user) redirect("/dashboard");

  return (
    <Suspense fallback={<Panel className="h-96 animate-pulse" />}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
