/**
 * Chooses the avatar engine.
 *
 * Every caller in the app goes through `getAvatarEngine()` and talks only to
 * the AvatarEngineProvider interface, so swapping engines is one environment
 * variable and touches no calling code.
 */

import { BuiltinAvatarEngine } from "./providers/builtin";
import { AvaturnEngine, MetaPersonEngine, ReadyPlayerMeEngine } from "./providers/vendor";
import type { AvatarEngineProvider } from "./types";

export const AVATAR_ENGINE_IDS = ["builtin", "metaperson", "readyplayerme", "avaturn"] as const;
export type AvatarEngineId = (typeof AVATAR_ENGINE_IDS)[number];

const FACTORIES: Record<AvatarEngineId, () => AvatarEngineProvider> = {
  builtin: () => new BuiltinAvatarEngine(),
  metaperson: () => new MetaPersonEngine(),
  readyplayerme: () => new ReadyPlayerMeEngine(),
  avaturn: () => new AvaturnEngine(),
};

/** Providers are stateless, so one instance per id is enough. */
const cache = new Map<AvatarEngineId, AvatarEngineProvider>();

export function isAvatarEngineId(value: string): value is AvatarEngineId {
  return (AVATAR_ENGINE_IDS as readonly string[]).includes(value);
}

/** The engine named by AVATAR_ENGINE_PROVIDER, defaulting to the built-in one. */
export function getAvatarEngine(explicitId?: string): AvatarEngineProvider {
  const requested = explicitId ?? process.env.AVATAR_ENGINE_PROVIDER ?? "builtin";

  if (!isAvatarEngineId(requested)) {
    // An unknown value is a configuration mistake. Falling back keeps the app
    // usable rather than failing every generation, but it must be loud.
    console.warn(
      `Unknown AVATAR_ENGINE_PROVIDER "${requested}". Falling back to "builtin". Valid values: ${AVATAR_ENGINE_IDS.join(", ")}.`,
    );
    return getAvatarEngine("builtin");
  }

  const existing = cache.get(requested);
  if (existing) return existing;

  const provider = FACTORIES[requested]();
  cache.set(requested, provider);
  return provider;
}

export * from "./types";
export { BuiltinAvatarEngine } from "./providers/builtin";
