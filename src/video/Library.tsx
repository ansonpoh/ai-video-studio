import React from "react";
import { AbsoluteFill, Composition, Folder, useCurrentFrame } from "remotion";
import { z } from "zod";
import { PROCEDURAL_ART } from "../schemas/catalog";
import { ArtLayer } from "./components/layers";

export const proceduralStillSchema = z.object({
  art: z.enum(PROCEDURAL_ART),
  primaryColor: z.string(),
  accentColor: z.string(),
  backgroundColor: z.string(),
  labels: z.string(),
  seed: z.number(),
});

/** Renders procedural art as a still. Used by the offline image provider. */
const ProceduralStill: React.FC<z.infer<typeof proceduralStillSchema>> = (p) => {
  useCurrentFrame();
  return (
    <AbsoluteFill style={{ backgroundColor: p.backgroundColor }}>
      <ArtLayer name="Art" art={p.art} primaryColor={p.primaryColor} accentColor={p.accentColor} backgroundColor={p.backgroundColor} labels={p.labels} seed={p.seed} labelFont="Inter, sans-serif" style={{}} />
    </AbsoluteFill>
  );
};

export const LibraryCompositions = () => (
  <Folder name="Library">
    <Composition
      id="ProceduralStill"
      component={ProceduralStill}
      schema={proceduralStillSchema}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={240}
      defaultProps={{ art: "earth-two-moons", primaryColor: "#8ab4ff", accentColor: "#ffe066", backgroundColor: "#070b18", labels: "", seed: 1 }}
    />
  </Folder>
);
