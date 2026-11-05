import type { TransitionPresentation, TransitionPresentationComponentProps } from "@remotion/transitions";
import { AbsoluteFill, interpolate } from "remotion";

type Empty = Record<string, never>;

const ZoomThrough = ({ children, presentationDirection, presentationProgress }: TransitionPresentationComponentProps<Empty>) => {
  const p = presentationProgress;
  const entering = presentationDirection === "entering";
  const scale = entering ? interpolate(p, [0, 1], [0.85, 1]) : interpolate(p, [0, 1], [1, 1.35]);
  const opacity = entering ? interpolate(p, [0, 0.6], [0, 1], { extrapolateRight: "clamp" }) : interpolate(p, [0.4, 1], [1, 0], { extrapolateLeft: "clamp" });
  return <AbsoluteFill style={{ scale: `${scale}`, opacity }}>{children}</AbsoluteFill>;
};

const BlurDissolve = ({ children, presentationDirection, presentationProgress }: TransitionPresentationComponentProps<Empty>) => {
  const p = presentationProgress;
  const entering = presentationDirection === "entering";
  const blur = entering ? (1 - p) * 30 : p * 30;
  const opacity = entering ? p : 1 - p * 0.6;
  return <AbsoluteFill style={{ filter: `blur(${blur}px)`, opacity }}>{children}</AbsoluteFill>;
};

const Flash = ({ children, presentationDirection, presentationProgress }: TransitionPresentationComponentProps<Empty>) => {
  const p = presentationProgress;
  const entering = presentationDirection === "entering";
  const white = entering ? interpolate(p, [0, 0.5, 1], [0, 1, 0]) : 0;
  return (
    <AbsoluteFill style={{ opacity: entering ? (p > 0.5 ? 1 : 0) : 1 }}>
      {children}
      {entering ? <AbsoluteFill style={{ backgroundColor: "white", opacity: white }} /> : null}
    </AbsoluteFill>
  );
};

const DipToBlack = ({ children, presentationDirection, presentationProgress }: TransitionPresentationComponentProps<Empty>) => {
  const p = presentationProgress;
  const entering = presentationDirection === "entering";
  const opacity = entering ? interpolate(p, [0.5, 1], [0, 1], { extrapolateLeft: "clamp" }) : interpolate(p, [0, 0.5], [1, 0], { extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity, backgroundColor: "black" }}>{children}</AbsoluteFill>;
};

export const zoomThrough = (): TransitionPresentation<Empty> => ({ component: ZoomThrough, props: {} });
export const blurDissolve = (): TransitionPresentation<Empty> => ({ component: BlurDissolve, props: {} });
export const flash = (): TransitionPresentation<Empty> => ({ component: Flash, props: {} });
export const dipToBlack = (): TransitionPresentation<Empty> => ({ component: DipToBlack, props: {} });
