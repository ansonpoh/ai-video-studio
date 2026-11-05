import React from "react";
import { ensureFonts } from "./fonts";
import { LibraryCompositions } from "./Library";
import { ProjectCompositions } from "./generated/registry";

ensureFonts();

export const RemotionRoot: React.FC = () => (
  <>
    <ProjectCompositions />
    <LibraryCompositions />
  </>
);
