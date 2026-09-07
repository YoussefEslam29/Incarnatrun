/**
 * Adapters for the third-party avatar vendors idea.md section 4 shortlists.
 *
 * These are deliberately unimplemented. Which vendor to use is an open
 * commercial question (idea.md section 12): cost per generation, licence terms,
 * export rights, and whether their editor embeds in our own UI or only works as
 * their hosted widget. Guessing at an API we have not signed up for would mean
 * writing code against imagined request shapes that has never run.
 *
 * What is settled is the boundary. Each adapter below implements the same
 * AvatarEngineProvider contract the built-in engine does, so completing one is
 * a self-contained job:
 *
 *   1. Fill in `generate` to upload the photo and poll until the model is
 *      ready, then download the GLB.
 *   2. Fill in `render` to apply edited parameters. If the vendor has no
 *      parameter API, delegate to the built-in engine's geometry and keep only
 *      their head mesh.
 *   3. Produce a thumbnail. `renderAvatarThumbnail` works on any mesh, so it
 *      can be reused rather than requiring a browser.
 *   4. Set AVATAR_ENGINE_PROVIDER to the adapter's id.
 *
 * Nothing outside this directory imports a vendor SDK, so no calling code
 * changes when one is chosen.
 */

import {
  EngineNotConfiguredError,
  type AvatarEngineProvider,
  type EngineResult,
  type GenerateInput,
  type RenderInput,
} from "../types";

interface VendorConfig {
  id: string;
  label: string;
  /** Where to sign up and read the API docs. */
  docsUrl: string;
}

abstract class VendorEngine implements AvatarEngineProvider {
  readonly id: string;
  readonly label: string;
  private readonly docsUrl: string;

  constructor(config: VendorConfig) {
    this.id = config.id;
    this.label = config.label;
    this.docsUrl = config.docsUrl;
  }

  isConfigured(): boolean {
    return Boolean(process.env.AVATAR_SDK_API_KEY && process.env.AVATAR_SDK_API_URL);
  }

  protected notImplemented(): never {
    if (!this.isConfigured()) {
      throw new EngineNotConfiguredError(
        this.id,
        `The ${this.label} engine needs AVATAR_SDK_API_KEY and AVATAR_SDK_API_URL to be set. Set AVATAR_ENGINE_PROVIDER=builtin to use the built-in engine instead, which needs no credentials.`,
      );
    }

    throw new EngineNotConfiguredError(
      this.id,
      `The ${this.label} adapter has not been implemented yet. Implement lib/avatar-engine/providers/vendor.ts against ${this.docsUrl}, or set AVATAR_ENGINE_PROVIDER=builtin.`,
    );
  }

  async generate(_input: GenerateInput): Promise<EngineResult> {
    this.notImplemented();
  }

  async render(_input: RenderInput): Promise<EngineResult> {
    this.notImplemented();
  }
}

export class MetaPersonEngine extends VendorEngine {
  constructor() {
    super({
      id: "metaperson",
      label: "Avatar SDK MetaPerson",
      docsUrl: "https://docs.metaperson.avatarsdk.com/",
    });
  }
}

export class ReadyPlayerMeEngine extends VendorEngine {
  constructor() {
    super({
      id: "readyplayerme",
      label: "Ready Player Me",
      docsUrl: "https://docs.readyplayer.me/",
    });
  }
}

export class AvaturnEngine extends VendorEngine {
  constructor() {
    super({ id: "avaturn", label: "Avaturn", docsUrl: "https://docs.avaturn.me/" });
  }
}
