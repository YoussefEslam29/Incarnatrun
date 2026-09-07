"use client";

import {
  ColorSwatch,
  Panel,
  PanelHeader,
  SelectCard,
  Slider,
} from "@/components/ui/primitives";
import { HAIR_STYLES, type FaceParams } from "@/lib/avatar-engine/params";

const HAIR_LABELS: Record<(typeof HAIR_STYLES)[number], string> = {
  none: "None",
  short: "Short",
  medium: "Medium",
  long: "Long",
  bun: "Bun",
  afro: "Afro",
};

export function FacePanel({
  value,
  onChange,
}: {
  value: FaceParams;
  onChange: (next: Partial<FaceParams>) => void;
}) {
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader label="Colour" />
        <div className="space-y-3 p-3">
          <ColorSwatch
            id="skinTone"
            label="Skin"
            value={value.skinTone}
            onChange={(skinTone) => onChange({ skinTone })}
          />
          <ColorSwatch
            id="hairColor"
            label="Hair"
            value={value.hairColor}
            onChange={(hairColor) => onChange({ hairColor })}
          />
          <ColorSwatch
            id="eyeColor"
            label="Eyes"
            value={value.eyeColor}
            onChange={(eyeColor) => onChange({ eyeColor })}
          />
          <p className="text-[0.75rem] leading-relaxed text-faint">
            These were sampled from your photo. Change them if the lighting threw
            them off.
          </p>
        </div>
      </Panel>

      <Panel>
        <PanelHeader label="Features" />
        <div className="space-y-4 p-3">
          <Slider
            id="jawWidth"
            label="Jaw"
            value={value.jawWidth}
            ends={["narrow", "square"]}
            onChange={(jawWidth) => onChange({ jawWidth })}
          />
          <Slider
            id="cheekFullness"
            label="Cheeks"
            value={value.cheekFullness}
            ends={["hollow", "full"]}
            onChange={(cheekFullness) => onChange({ cheekFullness })}
          />
          <Slider
            id="chinLength"
            label="Chin"
            value={value.chinLength}
            ends={["short", "long"]}
            onChange={(chinLength) => onChange({ chinLength })}
          />
          <Slider
            id="noseSize"
            label="Nose"
            value={value.noseSize}
            ends={["small", "large"]}
            onChange={(noseSize) => onChange({ noseSize })}
          />
          <Slider
            id="eyeSize"
            label="Eyes"
            value={value.eyeSize}
            ends={["small", "large"]}
            onChange={(eyeSize) => onChange({ eyeSize })}
          />
          <Slider
            id="browHeight"
            label="Brow"
            value={value.browHeight}
            ends={["low", "high"]}
            onChange={(browHeight) => onChange({ browHeight })}
          />
          <Slider
            id="mouthWidth"
            label="Mouth"
            value={value.mouthWidth}
            ends={["narrow", "wide"]}
            onChange={(mouthWidth) => onChange({ mouthWidth })}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader label="Hair" />
        <div className="grid grid-cols-3 gap-2 p-3">
          {HAIR_STYLES.map((style) => (
            <SelectCard
              key={style}
              selected={value.hairStyle === style}
              onSelect={() => onChange({ hairStyle: style })}
              className="p-2"
            >
              <span className="text-[0.8125rem] text-chalk">{HAIR_LABELS[style]}</span>
            </SelectCard>
          ))}
        </div>
      </Panel>
    </div>
  );
}
