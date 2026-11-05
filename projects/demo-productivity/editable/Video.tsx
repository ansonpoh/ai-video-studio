/**
 * Editable composition for project "demo-productivity".
 * Generated once by the video studio, then owned by you: open it in Remotion
 * Studio (npm run studio) and edit text, colours, positions, timing, captions
 * and media visually. Studio writes your changes back into this file.
 * Regenerating a single scene only patches that scene's named elements.
 */
import {staticFile, Track} from "remotion";
import {Audio} from "@remotion/media";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";
import {wipe} from "@remotion/transitions/wipe";
import {blurDissolve, dipToBlack, flash, zoomThrough} from "../../../src/video/animations/transitions";
import {
  AnimatedInfographicScene,
  ArtLayer,
  Backdrop,
  CaptionLayer,
  Chip,
  ComparisonScene,
  FactCardScene,
  FilmLook,
  ListicleScene,
  MediaLayer,
  MusicBed,
  NumberCounterScene,
  OutroScene,
  ProductShowcaseScene,
  QuoteScene,
  TextLayer,
  TimelineScene,
} from "../../../src/video/scenes";


export const Video_demo_productivity = () => {
  return (
    <>
      <TransitionSeries name="Scenes">
        <TransitionSeries.Sequence name="s01 · 3 habits for a *focused* day" durationInFrames={116}>
          <ArtLayer name="s01 visual" art="aurora-gradient" primaryColor="#1b1b3a" accentColor="#ffd23f" backgroundColor="#ff4d2e" labels="" seed={1} labelFont="Montserrat, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s01 title" animation="scale-pop" boxWidth={929} maxLines={3} uppercase={true} highlightColor="#ffd23f" shadow={1} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 400, fontSize: 130, color: "#ffffff", translate: "0px -77px"}}>3 habits for a *focused* day</TextLayer>
          <CaptionLayer name="s01 captions" captionStyle="bold" wordsPerGroup={3} highlightColor="#ffd23f" boxColor="rgba(0,0,0,0.55)" uppercase={true} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 900, fontSize: 92, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Three", startMs: 300, endMs: 748, timestampMs: 524, confidence: null},
            {text: " tiny", startMs: 748, endMs: 1106, timestampMs: 927, confidence: null},
            {text: " habits", startMs: 1106, endMs: 1643, timestampMs: 1375, confidence: null},
            {text: " for", startMs: 1643, endMs: 1912, timestampMs: 1778, confidence: null},
            {text: " a", startMs: 1912, endMs: 2091, timestampMs: 2002, confidence: null},
            {text: " far", startMs: 2091, endMs: 2359, timestampMs: 2225, confidence: null},
            {text: " more", startMs: 2359, endMs: 2718, timestampMs: 2539, confidence: null},
            {text: " focused", startMs: 2718, endMs: 3344, timestampMs: 3031, confidence: null},
            {text: " day.", startMs: 3344, endMs: 3694, timestampMs: 3519, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-right"})} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s02 · point" durationInFrames={156}>
          <Backdrop name="s02 backdrop" colorA="#ff4d2e" colorB="#ffd23f" angle={160} style={{}} />
          <ArtLayer name="s02 visual" art="calendar-blocks" primaryColor="#1b1b3a" accentColor="#ffd23f" backgroundColor="#ff4d2e" labels="" seed={2} labelFont="Montserrat, sans-serif" captionSafe style={{translate: "0px 0px", scale: 1, opacity: 0.22, filter: "blur(10px)"}} />
          <ListicleScene name="s02 layout" number={1} heading="Plan tomorrow tonight" body="Pick your top three tasks before bed." accentColor="#ffd23f" textColor="#ffffff" panelColor="rgba(27,27,58,0.82)" displayFont="Anton, Impact, sans-serif" bodyFont="Montserrat, sans-serif" animation="slide-left" style={{translate: "0px 0px", scale: 1}} />
          <CaptionLayer name="s02 captions" captionStyle="bold" wordsPerGroup={3} highlightColor="#ffd23f" boxColor="rgba(0,0,0,0.55)" uppercase={true} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 900, fontSize: 92, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "One:", startMs: 600, endMs: 894, timestampMs: 747, confidence: null},
            {text: " plan", startMs: 1052, endMs: 1353, timestampMs: 1203, confidence: null},
            {text: " tomorrow", startMs: 1353, endMs: 1955, timestampMs: 1654, confidence: null},
            {text: " tonight.", startMs: 1955, endMs: 2487, timestampMs: 2221, confidence: null},
            {text: " Pick", startMs: 2707, endMs: 3008, timestampMs: 2858, confidence: null},
            {text: " your", startMs: 3008, endMs: 3309, timestampMs: 3159, confidence: null},
            {text: " top", startMs: 3309, endMs: 3535, timestampMs: 3422, confidence: null},
            {text: " three", startMs: 3535, endMs: 3911, timestampMs: 3723, confidence: null},
            {text: " tasks", startMs: 3911, endMs: 4288, timestampMs: 4100, confidence: null},
            {text: " before", startMs: 4288, endMs: 4739, timestampMs: 4514, confidence: null},
            {text: " bed.", startMs: 4739, endMs: 5033, timestampMs: 4886, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-right"})} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s03 · point" durationInFrames={171}>
          <Backdrop name="s03 backdrop" colorA="#ff4d2e" colorB="#ffd23f" angle={160} style={{}} />
          <ArtLayer name="s03 visual" art="focus-timer" primaryColor="#1b1b3a" accentColor="#ffd23f" backgroundColor="#ff4d2e" labels="" seed={3} labelFont="Montserrat, sans-serif" captionSafe style={{translate: "0px 0px", scale: 1, opacity: 0.22, filter: "blur(10px)"}} />
          <ListicleScene name="s03 layout" number={2} heading="Work in focus sprints" body="25 to 50 minutes on, short break off." accentColor="#ffd23f" textColor="#ffffff" panelColor="rgba(27,27,58,0.82)" displayFont="Anton, Impact, sans-serif" bodyFont="Montserrat, sans-serif" animation="slide-left" style={{translate: "0px 0px", scale: 1}} />
          <CaptionLayer name="s03 captions" captionStyle="bold" wordsPerGroup={3} highlightColor="#ffd23f" boxColor="rgba(0,0,0,0.55)" uppercase={true} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 900, fontSize: 92, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Two:", startMs: 600, endMs: 906, timestampMs: 753, confidence: null},
            {text: " work", startMs: 1070, endMs: 1384, timestampMs: 1227, confidence: null},
            {text: " in", startMs: 1384, endMs: 1541, timestampMs: 1463, confidence: null},
            {text: " focus", startMs: 1541, endMs: 1933, timestampMs: 1737, confidence: null},
            {text: " sprints,", startMs: 1933, endMs: 2497, timestampMs: 2215, confidence: null},
            {text: " twenty", startMs: 2717, endMs: 3187, timestampMs: 2952, confidence: null},
            {text: " five", startMs: 3187, endMs: 3500, timestampMs: 3344, confidence: null},
            {text: " to", startMs: 3500, endMs: 3657, timestampMs: 3579, confidence: null},
            {text: " fifty", startMs: 3657, endMs: 4049, timestampMs: 3853, confidence: null},
            {text: " minutes,", startMs: 4049, endMs: 4613, timestampMs: 4331, confidence: null},
            {text: " then", startMs: 4833, endMs: 5147, timestampMs: 4990, confidence: null},
            {text: " rest.", startMs: 5147, endMs: 5503, timestampMs: 5325, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-right"})} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s04 · point" durationInFrames={141}>
          <Backdrop name="s04 backdrop" colorA="#ff4d2e" colorB="#ffd23f" angle={160} style={{}} />
          <ArtLayer name="s04 visual" art="phone-focus" primaryColor="#1b1b3a" accentColor="#ffd23f" backgroundColor="#ff4d2e" labels="" seed={4} labelFont="Montserrat, sans-serif" captionSafe style={{translate: "0px 0px", scale: 1, opacity: 0.22, filter: "blur(10px)"}} />
          <ListicleScene name="s04 layout" number={3} heading="Silence your phone" body="Out of sight, out of reach." accentColor="#ffd23f" textColor="#ffffff" panelColor="rgba(27,27,58,0.82)" displayFont="Anton, Impact, sans-serif" bodyFont="Montserrat, sans-serif" animation="slide-left" style={{translate: "0px 0px", scale: 1}} />
          <CaptionLayer name="s04 captions" captionStyle="bold" wordsPerGroup={3} highlightColor="#ffd23f" boxColor="rgba(0,0,0,0.55)" uppercase={true} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 900, fontSize: 92, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Three:", startMs: 600, endMs: 1106, timestampMs: 853, confidence: null},
            {text: " silence", startMs: 1326, endMs: 1962, timestampMs: 1644, confidence: null},
            {text: " your", startMs: 1962, endMs: 2325, timestampMs: 2144, confidence: null},
            {text: " phone", startMs: 2325, endMs: 2779, timestampMs: 2552, confidence: null},
            {text: " and", startMs: 2779, endMs: 3052, timestampMs: 2916, confidence: null},
            {text: " put", startMs: 3052, endMs: 3324, timestampMs: 3188, confidence: null},
            {text: " it", startMs: 3324, endMs: 3506, timestampMs: 3415, confidence: null},
            {text: " out", startMs: 3506, endMs: 3778, timestampMs: 3642, confidence: null},
            {text: " of", startMs: 3778, endMs: 3960, timestampMs: 3869, confidence: null},
            {text: " reach.", startMs: 3960, endMs: 4466, timestampMs: 4213, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={zoomThrough()} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s05 · Stack all three" durationInFrames={152}>
          <ArtLayer name="s05 visual" art="checklist" primaryColor="#1b1b3a" accentColor="#ffd23f" backgroundColor="#ff4d2e" labels="Plan tonight | Focus sprints | Phone away" seed={5} labelFont="Montserrat, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s05 title" animation="slide-left" boxWidth={929} maxLines={3} uppercase={true} highlightColor="#ffd23f" shadow={1} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 400, fontSize: 84, color: "#ffffff", translate: "0px -691px"}}>Stack all three</TextLayer>
          <CaptionLayer name="s05 captions" captionStyle="bold" wordsPerGroup={3} highlightColor="#ffd23f" boxColor="rgba(0,0,0,0.55)" uppercase={true} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 900, fontSize: 92, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Stack", startMs: 600, endMs: 1047, timestampMs: 824, confidence: null},
            {text: " all", startMs: 1047, endMs: 1315, timestampMs: 1181, confidence: null},
            {text: " three,", startMs: 1315, endMs: 1811, timestampMs: 1563, confidence: null},
            {text: " and", startMs: 2031, endMs: 2299, timestampMs: 2165, confidence: null},
            {text: " your", startMs: 2299, endMs: 2657, timestampMs: 2478, confidence: null},
            {text: " best", startMs: 2657, endMs: 3014, timestampMs: 2836, confidence: null},
            {text: " hours", startMs: 3014, endMs: 3461, timestampMs: 3238, confidence: null},
            {text: " go", startMs: 3461, endMs: 3640, timestampMs: 3551, confidence: null},
            {text: " to", startMs: 3640, endMs: 3819, timestampMs: 3730, confidence: null},
            {text: " what", startMs: 3819, endMs: 4177, timestampMs: 3998, confidence: null},
            {text: " matters.", startMs: 4177, endMs: 4851, timestampMs: 4514, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({direction: "from-bottom"})} timing={linearTiming({durationInFrames: 14})} />
        <TransitionSeries.Sequence name="s06 · Try one tomorrow" durationInFrames={120}>
          <Backdrop name="s06 backdrop" colorA="#ff4d2e" colorB="#ffd23f" angle={160} style={{}} />
          <ArtLayer name="s06 visual" art="aurora-gradient" primaryColor="#1b1b3a" accentColor="#ffd23f" backgroundColor="#ff4d2e" labels="" seed={6} labelFont="Montserrat, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1, opacity: 0.22, filter: "blur(10px)"}} />
          <OutroScene name="s06 layout" cta="Save this. Try one habit tomorrow." handle="" accentColor="#ffd23f" textColor="#ffffff" panelColor="rgba(27,27,58,0.82)" displayFont="Anton, Impact, sans-serif" bodyFont="Montserrat, sans-serif" animation="scale-pop" style={{translate: "0px 0px", scale: 1}} />
          <CaptionLayer name="s06 captions" captionStyle="bold" wordsPerGroup={3} highlightColor="#ffd23f" boxColor="rgba(0,0,0,0.55)" uppercase={true} style={{fontFamily: "Anton, Impact, sans-serif", fontWeight: 900, fontSize: 92, color: "#ffffff", translate: "0px -384px"}} captions={[
            {text: "Save", startMs: 600, endMs: 941, timestampMs: 771, confidence: null},
            {text: " this", startMs: 941, endMs: 1282, timestampMs: 1112, confidence: null},
            {text: " and", startMs: 1282, endMs: 1537, timestampMs: 1410, confidence: null},
            {text: " try", startMs: 1537, endMs: 1793, timestampMs: 1665, confidence: null},
            {text: " one", startMs: 1793, endMs: 2049, timestampMs: 1921, confidence: null},
            {text: " habit", startMs: 2049, endMs: 2475, timestampMs: 2262, confidence: null},
            {text: " tomorrow.", startMs: 2475, endMs: 3192, timestampMs: 2834, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <FilmLook name="Film look" vignette={0.15} grain={0} tint="#1b1b3a" tintAmount={0} />
      <Track name="Music">
        <MusicBed name="Music" src={staticFile("demo-productivity/audio/background-music.mp3")} volume={0.18} duckTo={0.072} fadeInSeconds={1} fadeOutSeconds={2} muted={false} duckRanges={[]} />
      </Track>
      <Track name="Sound effects">
        <Audio name="s01 sfx whoosh" src={staticFile("demo-productivity/audio/sfx-s01-whoosh.mp3")} from={0} volume={0.45} />
        <Audio name="s02 sfx pop" src={staticFile("demo-productivity/audio/sfx-s02-pop.mp3")} from={102} volume={0.45} />
        <Audio name="s03 sfx pop" src={staticFile("demo-productivity/audio/sfx-s03-pop.mp3")} from={244} volume={0.45} />
        <Audio name="s04 sfx pop" src={staticFile("demo-productivity/audio/sfx-s04-pop.mp3")} from={401} volume={0.45} />
      </Track>
    </>
  );
};
