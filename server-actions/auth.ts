"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { hashPassword, signIn, signOut, signUpSchema } from "@/lib/auth";
import { prisma } from "@/lib/db/client";
import { action, fail, ok, type ActionResult } from "@/lib/actions/result";

/**
 * Turns a Zod issue list into per-field messages the form can render inline.
 */
function fieldErrorsOf(issues: { path: PropertyKey[]; message: string }[]) {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export async function signUpAction(
  _previous: ActionResult<{ email: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ email: string }>> {
  return action(async () => {
    const parsed = signUpSchema.safeParse({
      name: (formData.get("name") as string) || undefined,
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      return fail("Check the details below.", fieldErrorsOf(parsed.error.issues));
    }

    const { email, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      // Naming the field lets the form point at it. This does disclose that the
      // address is registered, which is the accepted trade for a sign-up form:
      // the alternative is a user who cannot tell why their account will not
      // create.
      return fail("An account already exists for that email.", {
        email: "That email is already registered. Sign in instead.",
      });
    }

    await prisma.user.create({
      data: { email, name: name ?? null, passwordHash: await hashPassword(password) },
    });

    // Sign straight in. Making someone type the same password twice in a row is
    // friction with nothing behind it.
    await signIn("credentials", { email, password, redirect: false });

    return ok({ email }, "Account created.");
  });
}

export async function signInAction(
  _previous: ActionResult<undefined> | undefined,
  formData: FormData,
): Promise<ActionResult<undefined>> {
  return action(async () => {
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if (!email || !password) {
      return fail("Enter your email and password.");
    }

    try {
      await signIn("credentials", { email, password, redirect: false });
    } catch (error) {
      if (error instanceof AuthError) {
        // Deliberately does not say which of the two was wrong. Saying so turns
        // the form into an account-enumeration oracle.
        return fail("That email and password do not match.");
      }
      throw error;
    }

    return ok(undefined, "Signed in.");
  });
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect("/");
}
