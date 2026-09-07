import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthForm } from "@/components/auth/auth-form";
import { Panel } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to open your saved avatars.",
};

export default async function SignInPage() {
  // Someone already signed in has no use for this page.
  if ((await auth())?.user) redirect("/dashboard");

  return (
    <Suspense fallback={<Panel className="h-96 animate-pulse" />}>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
