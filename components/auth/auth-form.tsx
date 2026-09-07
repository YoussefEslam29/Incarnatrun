"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Panel } from "@/components/ui/primitives";
import { notify } from "@/components/ui/toaster";
import { signInAction, signUpAction } from "@/server-actions/auth";
import type { ActionResult } from "@/lib/actions/result";

type Mode = "sign-in" | "sign-up";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const isSignUp = mode === "sign-up";

  // Where to land afterwards. Only same-origin relative paths are honoured, so
  // a crafted `next` cannot bounce someone to another site after sign-in.
  const raw = params.get("next") ?? "/dashboard";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";

  const [state, formAction, pending] = useActionState<
    ActionResult<unknown> | undefined,
    FormData
  >(
    isSignUp
      ? (signUpAction as (
          prev: ActionResult<unknown> | undefined,
          data: FormData,
        ) => Promise<ActionResult<unknown>>)
      : (signInAction as (
          prev: ActionResult<unknown> | undefined,
          data: FormData,
        ) => Promise<ActionResult<unknown>>),
    undefined,
  );

  // Every action result reaches a toast, per PLAN/idea.md section 15. Navigation
  // happens here rather than inside the action so the toast is not discarded by
  // the redirect.
  const handled = React.useRef<ActionResult<unknown> | undefined>(undefined);
  React.useEffect(() => {
    if (!state || state === handled.current) return;
    handled.current = state;

    if (notify(state)) {
      router.push(next);
      router.refresh();
    }
  }, [state, router, next]);

  return (
    <Panel className="p-6">
      <div className="mb-6 space-y-1.5">
        <h1 className="type-display text-2xl text-chalk">
          {isSignUp ? "Create your account" : "Welcome back"}
        </h1>
        <p className="text-[0.8125rem] text-mute">
          {isSignUp
            ? "Your avatars are saved so you can come back and keep editing them."
            : "Sign in to open your saved avatars."}
        </p>
      </div>

      <form action={formAction} className="space-y-4" noValidate>
        {isSignUp && (
          <Field
            label="Name"
            htmlFor="name"
            hint="Shown in the header. You can leave it blank."
            error={state?.fieldErrors?.name}
          >
            <Input id="name" name="name" autoComplete="name" placeholder="Alex" />
          </Field>
        )}

        <Field label="Email" htmlFor="email" error={state?.fieldErrors?.email}>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint={isSignUp ? "At least 8 characters." : undefined}
          error={state?.fieldErrors?.password}
        >
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={isSignUp ? 8 : undefined}
            autoComplete={isSignUp ? "new-password" : "current-password"}
          />
        </Field>

        {state && !state.success && !state.fieldErrors && (
          <p className="rounded-[3px] border border-bad/40 bg-bad/[0.08] px-3 py-2 text-[0.8125rem] text-bad" role="alert">
            {state.message}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" loading={pending}>
          {isSignUp ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[0.8125rem] text-mute">
        {isSignUp ? "Already have an account? " : "New here? "}
        <Link
          href={isSignUp ? "/sign-in" : "/sign-up"}
          // Underlined always, not only on hover: a link inside a sentence
          // that is distinguished by colour alone fails for anyone who cannot
          // separate the two hues.
          className="rounded-[3px] text-beam underline underline-offset-4 decoration-beam/50 hover:decoration-beam"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </Panel>
  );
}
