import { loadFont } from "@remotion/fonts";
import { continueRender, delayRender } from "remotion";
import inter from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2";
import playfair from "@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2";
import anton from "@fontsource/anton/files/anton-latin-400-normal.woff2";
import bebas from "@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff2";
import grotesk from "@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2";
import montserrat from "@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2";
import fraunces from "@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2";

/** Fonts are bundled locally (OFL licensed via Fontsource) so renders never depend on the network. */
const FONTS: { family: string; url: string; weight: string }[] = [
  { family: "Inter", url: inter, weight: "100 900" },
  { family: "Playfair Display", url: playfair, weight: "400 900" },
  { family: "Anton", url: anton, weight: "400" },
  { family: "Bebas Neue", url: bebas, weight: "400" },
  { family: "Space Grotesk", url: grotesk, weight: "300 700" },
  { family: "Montserrat", url: montserrat, weight: "100 900" },
  { family: "Fraunces", url: fraunces, weight: "100 900" },
];

let started = false;
export const ensureFonts = () => {
  if (started) return;
  started = true;
  if (typeof document === "undefined") return;
  const handle = delayRender("Loading fonts");
  Promise.all(FONTS.map((f) => loadFont({ family: f.family, url: f.url, weight: f.weight })))
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error("Font loading failed", err);
      continueRender(handle);
    });
};
