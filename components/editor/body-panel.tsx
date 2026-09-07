"use client";

import { Panel, PanelHeader, SelectCard, Slider } from "@/components/ui/primitives";
import { BODY_TEMPLATES, type BodyParams } from "@/lib/avatar-engine/params";

/**
 * Body controls.
 *
 * Every slider names both ends. "Build: 0.62" tells the user nothing about
 * which way to drag; "slim / heavy" does. Height is shown in centimetres
 * because that is the unit the number actually means.
 */
export function BodyPanel({
  value,
  onChange,
}: {
  value: BodyParams;
  onChange: (next: Partial<BodyParams>) => void;
}) {
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader label="Proportions" />
        <div className="space-y-4 p-3">
          <Slider
            id="heightCm"
            label="Height"
            min={140}
            max={210}
            step={1}
            value={value.heightCm}
            display={`${value.heightCm} cm`}
            ends={["140 cm", "210 cm"]}
            onChange={(next) => onChange({ heightCm: Math.round(next) })}
          />
          <Slider
            id="legLength"
            label="Leg length"
            value={value.legLength}
            ends={["shorter legs", "longer legs"]}
            onChange={(legLength) => onChange({ legLength })}
          />
          <Slider
            id="armLength"
            label="Arm length"
            value={value.armLength}
            ends={["shorter arms", "longer arms"]}
            onChange={(armLength) => onChange({ armLength })}
          />
          <Slider
            id="headSize"
            label="Head size"
            value={value.headSize}
            ends={["smaller", "larger"]}
            onChange={(headSize) => onChange({ headSize })}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader label="Shape" />
        <div className="space-y-4 p-3">
          <Slider
            id="build"
            label="Build"
            value={value.build}
            ends={["slim", "heavy"]}
            onChange={(build) => onChange({ build })}
          />
          <Slider
            id="muscle"
            label="Muscle"
            value={value.muscle}
            ends={["soft", "defined"]}
            onChange={(muscle) => onChange({ muscle })}
          />
          <Slider
            id="shoulderWidth"
            label="Shoulders"
            value={value.shoulderWidth}
            ends={["narrow", "broad"]}
            onChange={(shoulderWidth) => onChange({ shoulderWidth })}
          />
          <Slider
            id="chest"
            label="Chest"
            value={value.chest}
            ends={["flat", "full"]}
            onChange={(chest) => onChange({ chest })}
          />
          <Slider
            id="waist"
            label="Waist"
            value={value.waist}
            ends={["narrow", "wide"]}
            onChange={(waist) => onChange({ waist })}
          />
          <Slider
            id="hips"
            label="Hips"
            value={value.hips}
            ends={["narrow", "wide"]}
            onChange={(hips) => onChange({ hips })}
          />
        </div>
      </Panel>

      <Panel>
        <PanelHeader label="Start from a template" />
        <div className="grid grid-cols-3 gap-2 p-3">
          {BODY_TEMPLATES.map((template) => (
            <SelectCard
              key={template.id}
              selected={value.template === template.id}
              onSelect={() =>
                // Selecting a template moves the sliders it governs and leaves
                // the rest, so the user's height and limb lengths survive.
                onChange({
                  template: template.id,
                  build: template.build,
                  muscle: template.muscle,
                  shoulderWidth: template.shoulderWidth,
                  chest: template.build,
                  waist: template.build,
                  hips: template.build,
                })
              }
              className="p-2"
            >
              <span className="text-[0.8125rem] text-chalk">{template.label}</span>
            </SelectCard>
          ))}
        </div>
      </Panel>
    </div>
  );
}
