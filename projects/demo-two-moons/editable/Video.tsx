/**
 * Editable composition for project "demo-two-moons".
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


export const Video_demo_two_moons = () => {
  return (
    <>
      <TransitionSeries name="Scenes">
        <TransitionSeries.Sequence name="s01 · What if Earth had *two* moons?" durationInFrames={167}>
          <MediaLayer name="s01 visual" src={staticFile("demo-two-moons/assets/s01-still-v1.png")} mediaType="image" motion="pull-out" motionStrength={0.08} darken={0.35} blur={0} style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s01 title" animation="blur-in" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffb86b" shadow={1} style={{fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 88, color: "#fbf8ff", translate: "0px -461px"}}>What if Earth had *two* moons?</TextLayer>
          <Chip name="s01 label" color="#ffb86b" textColor="#04030c" fontFamily="Inter, sans-serif" style={{translate: "0px 115px"}}>Speculative scenario</Chip>
          <CaptionLayer name="s01 captions" captionStyle="cinematic" wordsPerGroup={7} highlightColor="#ffb86b" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: "0px -384px"}} captions={[
            {text: "Imagine", startMs: 300, endMs: 918, timestampMs: 609, confidence: null},
            {text: " looking", startMs: 918, endMs: 1536, timestampMs: 1227, confidence: null},
            {text: " up", startMs: 1536, endMs: 1712, timestampMs: 1624, confidence: null},
            {text: " one", startMs: 1712, endMs: 1977, timestampMs: 1845, confidence: null},
            {text: " night", startMs: 1977, endMs: 2419, timestampMs: 2198, confidence: null},
            {text: " and", startMs: 2419, endMs: 2684, timestampMs: 2552, confidence: null},
            {text: " seeing", startMs: 2684, endMs: 3213, timestampMs: 2949, confidence: null},
            {text: " not", startMs: 3213, endMs: 3478, timestampMs: 3346, confidence: null},
            {text: " one", startMs: 3478, endMs: 3743, timestampMs: 3611, confidence: null},
            {text: " moon,", startMs: 3743, endMs: 4145, timestampMs: 3944, confidence: null},
            {text: " but", startMs: 4361, endMs: 4626, timestampMs: 4494, confidence: null},
            {text: " two.", startMs: 4626, endMs: 4970, timestampMs: 4798, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={blurDissolve()} timing={linearTiming({durationInFrames: 16})} />
        <TransitionSeries.Sequence name="s02 · A second companion" durationInFrames={166}>
          <ArtLayer name="s02 visual" art="earth-two-moons" primaryColor="#c9b6ff" accentColor="#ffb86b" backgroundColor="#04030c" labels="" seed={2} labelFont="Inter, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s02 title" animation="fade-up" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffb86b" shadow={1} style={{fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 88, color: "#fbf8ff", translate: "0px -461px"}}>A second companion</TextLayer>
          <Chip name="s02 label" color="#ffb86b" textColor="#04030c" fontFamily="Inter, sans-serif" style={{translate: "0px 115px"}}>Speculative scenario</Chip>
          <CaptionLayer name="s02 captions" captionStyle="cinematic" wordsPerGroup={7} highlightColor="#ffb86b" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: "0px -384px"}} captions={[
            {text: "In", startMs: 667, endMs: 805, timestampMs: 736, confidence: null},
            {text: " this", startMs: 805, endMs: 1080, timestampMs: 943, confidence: null},
            {text: " thought", startMs: 1080, endMs: 1561, timestampMs: 1321, confidence: null},
            {text: " experiment,", startMs: 1561, endMs: 2235, timestampMs: 1898, confidence: null},
            {text: " a", startMs: 2455, endMs: 2593, timestampMs: 2524, confidence: null},
            {text: " smaller", startMs: 2593, endMs: 3074, timestampMs: 2834, confidence: null},
            {text: " second", startMs: 3074, endMs: 3487, timestampMs: 3281, confidence: null},
            {text: " moon", startMs: 3487, endMs: 3762, timestampMs: 3625, confidence: null},
            {text: " circles", startMs: 3762, endMs: 4244, timestampMs: 4003, confidence: null},
            {text: " beside", startMs: 4244, endMs: 4656, timestampMs: 4450, confidence: null},
            {text: " ours.", startMs: 4656, endMs: 4969, timestampMs: 4813, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
        <TransitionSeries.Sequence name="s03 · Tides in conflict" durationInFrames={189}>
          <ArtLayer name="s03 visual" art="tides" primaryColor="#c9b6ff" accentColor="#ffb86b" backgroundColor="#04030c" labels="Extra gravitational pull | Higher, irregular tides" seed={3} labelFont="Inter, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s03 title" animation="fade-up" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffb86b" shadow={1} style={{fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 70, color: "#fbf8ff", translate: "0px -691px"}}>Tides in conflict</TextLayer>
          <Chip name="s03 label" color="#ffb86b" textColor="#04030c" fontFamily="Inter, sans-serif" style={{translate: "0px 115px"}}>Speculative scenario</Chip>
          <CaptionLayer name="s03 captions" captionStyle="cinematic" wordsPerGroup={7} highlightColor="#ffb86b" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: "0px -384px"}} captions={[
            {text: "Pulled", startMs: 533, endMs: 930, timestampMs: 732, confidence: null},
            {text: " from", startMs: 930, endMs: 1195, timestampMs: 1063, confidence: null},
            {text: " two", startMs: 1195, endMs: 1393, timestampMs: 1294, confidence: null},
            {text: " directions,", startMs: 1393, endMs: 2033, timestampMs: 1713, confidence: null},
            {text: " the", startMs: 2253, endMs: 2452, timestampMs: 2353, confidence: null},
            {text: " oceans", startMs: 2452, endMs: 2849, timestampMs: 2651, confidence: null},
            {text: " could", startMs: 2849, endMs: 3180, timestampMs: 3015, confidence: null},
            {text: " swell", startMs: 3180, endMs: 3511, timestampMs: 3346, confidence: null},
            {text: " into", startMs: 3511, endMs: 3775, timestampMs: 3643, confidence: null},
            {text: " higher,", startMs: 3775, endMs: 4163, timestampMs: 3969, confidence: null},
            {text: " less", startMs: 4371, endMs: 4636, timestampMs: 4504, confidence: null},
            {text: " predictable", startMs: 4636, endMs: 5364, timestampMs: 5000, confidence: null},
            {text: " tides.", startMs: 5364, endMs: 5708, timestampMs: 5536, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={blurDissolve()} timing={linearTiming({durationInFrames: 16})} />
        <TransitionSeries.Sequence name="s04 · Restless seas" durationInFrames={178}>
          <MediaLayer name="s04 visual" src={staticFile("demo-two-moons/assets/s04-still-v1.png")} mediaType="image" motion="pan-down" motionStrength={0.08} darken={0.35} blur={0} style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s04 title" animation="fade-up" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffb86b" shadow={1} style={{fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 88, color: "#fbf8ff", translate: "0px -461px"}}>Restless seas</TextLayer>
          <Chip name="s04 label" color="#ffb86b" textColor="#04030c" fontFamily="Inter, sans-serif" style={{translate: "0px 115px"}}>Speculative scenario</Chip>
          <CaptionLayer name="s04 captions" captionStyle="cinematic" wordsPerGroup={7} highlightColor="#ffb86b" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: "0px -384px"}} captions={[
            {text: "Coastlines", startMs: 667, endMs: 1381, timestampMs: 1024, confidence: null},
            {text: " would", startMs: 1381, endMs: 1738, timestampMs: 1560, confidence: null},
            {text: " reshape,", startMs: 1738, endMs: 2232, timestampMs: 1985, confidence: null},
            {text: " and", startMs: 2452, endMs: 2666, timestampMs: 2559, confidence: null},
            {text: " shore", startMs: 2666, endMs: 3023, timestampMs: 2845, confidence: null},
            {text: " life", startMs: 3023, endMs: 3309, timestampMs: 3166, confidence: null},
            {text: " would", startMs: 3309, endMs: 3666, timestampMs: 3488, confidence: null},
            {text: " adapt", startMs: 3666, endMs: 4023, timestampMs: 3845, confidence: null},
            {text: " to", startMs: 4023, endMs: 4166, timestampMs: 4095, confidence: null},
            {text: " a", startMs: 4166, endMs: 4309, timestampMs: 4238, confidence: null},
            {text: " restless", startMs: 4309, endMs: 4880, timestampMs: 4595, confidence: null},
            {text: " rhythm.", startMs: 4880, endMs: 5302, timestampMs: 5091, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
        <TransitionSeries.Sequence name="s05 · A fragile dance" durationInFrames={197}>
          <ArtLayer name="s05 visual" art="orbit-diagram" primaryColor="#c9b6ff" accentColor="#ffb86b" backgroundColor="#04030c" labels="Orbits interact | Unstable over time" seed={5} labelFont="Inter, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s05 title" animation="fade-up" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffb86b" shadow={1} style={{fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 70, color: "#fbf8ff", translate: "0px -691px"}}>A fragile dance</TextLayer>
          <Chip name="s05 label" color="#ffb86b" textColor="#04030c" fontFamily="Inter, sans-serif" style={{translate: "0px 115px"}}>Speculative scenario</Chip>
          <CaptionLayer name="s05 captions" captionStyle="cinematic" wordsPerGroup={7} highlightColor="#ffb86b" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: "0px -384px"}} captions={[
            {text: "But", startMs: 533, endMs: 747, timestampMs: 640, confidence: null},
            {text: " two", startMs: 747, endMs: 960, timestampMs: 854, confidence: null},
            {text: " moons", startMs: 960, endMs: 1316, timestampMs: 1138, confidence: null},
            {text: " rarely", startMs: 1316, endMs: 1743, timestampMs: 1530, confidence: null},
            {text: " stay", startMs: 1743, endMs: 2028, timestampMs: 1886, confidence: null},
            {text: " in", startMs: 2028, endMs: 2171, timestampMs: 2100, confidence: null},
            {text: " harmony.", startMs: 2171, endMs: 2663, timestampMs: 2417, confidence: null},
            {text: " Their", startMs: 2883, endMs: 3239, timestampMs: 3061, confidence: null},
            {text: " gravity", startMs: 3239, endMs: 3737, timestampMs: 3488, confidence: null},
            {text: " could", startMs: 3737, endMs: 4093, timestampMs: 3915, confidence: null},
            {text: " slowly", startMs: 4093, endMs: 4520, timestampMs: 4307, confidence: null},
            {text: " unbalance", startMs: 4520, endMs: 5161, timestampMs: 4841, confidence: null},
            {text: " their", startMs: 5161, endMs: 5517, timestampMs: 5339, confidence: null},
            {text: " orbits.", startMs: 5517, endMs: 5938, timestampMs: 5728, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={dipToBlack()} timing={linearTiming({durationInFrames: 18})} />
        <TransitionSeries.Sequence name="s06 · Collision course" durationInFrames={168}>
          <ArtLayer name="s06 visual" art="eclipse" primaryColor="#c9b6ff" accentColor="#ffb86b" backgroundColor="#04030c" labels="" seed={6} labelFont="Inter, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1}} />
          <TextLayer name="s06 title" animation="blur-in" boxWidth={929} maxLines={3} uppercase={false} highlightColor="#ffb86b" shadow={1} style={{fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 88, color: "#fbf8ff", translate: "0px -461px"}}>Collision course</TextLayer>
          <Chip name="s06 label" color="#ffb86b" textColor="#04030c" fontFamily="Inter, sans-serif" style={{translate: "0px 115px"}}>Speculative scenario</Chip>
          <CaptionLayer name="s06 captions" captionStyle="cinematic" wordsPerGroup={7} highlightColor="#ffb86b" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: "0px -384px"}} captions={[
            {text: "One", startMs: 733, endMs: 996, timestampMs: 865, confidence: null},
            {text: " might", startMs: 996, endMs: 1434, timestampMs: 1215, confidence: null},
            {text: " collide", startMs: 1434, endMs: 2048, timestampMs: 1741, confidence: null},
            {text: " with", startMs: 2048, endMs: 2399, timestampMs: 2224, confidence: null},
            {text: " the", startMs: 2399, endMs: 2662, timestampMs: 2531, confidence: null},
            {text: " other,", startMs: 2662, endMs: 3143, timestampMs: 2903, confidence: null},
            {text: " or", startMs: 3363, endMs: 3538, timestampMs: 3451, confidence: null},
            {text: " be", startMs: 3538, endMs: 3714, timestampMs: 3626, confidence: null},
            {text: " flung", startMs: 3714, endMs: 4152, timestampMs: 3933, confidence: null},
            {text: " into", startMs: 4152, endMs: 4502, timestampMs: 4327, confidence: null},
            {text: " space.", startMs: 4502, endMs: 4984, timestampMs: 4743, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={blurDissolve()} timing={linearTiming({durationInFrames: 16})} />
        <TransitionSeries.Sequence name="s07 · One moon" durationInFrames={221}>
          <Backdrop name="s07 backdrop" colorA="#04030c" colorB="#1a1033" angle={160} style={{}} />
          <ArtLayer name="s07 visual" art="starfield" primaryColor="#c9b6ff" accentColor="#ffb86b" backgroundColor="#04030c" labels="" seed={7} labelFont="Inter, sans-serif" titleSafe captionSafe style={{translate: "0px 0px", scale: 1, opacity: 0.3}} />
          <OutroScene name="s07 layout" cta="One moon. One delicate balance." handle="" accentColor="#ffb86b" textColor="#fbf8ff" panelColor="rgba(8,10,22,0.66)" displayFont="'Playfair Display', serif" bodyFont="Inter, sans-serif" animation="fade-up" style={{translate: "0px 0px", scale: 1}} />
          <CaptionLayer name="s07 captions" captionStyle="cinematic" wordsPerGroup={7} highlightColor="#ffb86b" boxColor="rgba(0,0,0,0.55)" uppercase={false} style={{fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontWeight: 500, fontSize: 56, color: "#f5f1e8", letterSpacing: 0.5, translate: "0px -384px"}} captions={[
            {text: "Only", startMs: 667, endMs: 1069, timestampMs: 868, confidence: null},
            {text: " a", startMs: 1069, endMs: 1270, timestampMs: 1170, confidence: null},
            {text: " what", startMs: 1270, endMs: 1671, timestampMs: 1471, confidence: null},
            {text: " if,", startMs: 1671, endMs: 1998, timestampMs: 1835, confidence: null},
            {text: " but", startMs: 2174, endMs: 2475, timestampMs: 2325, confidence: null},
            {text: " it", startMs: 2475, endMs: 2676, timestampMs: 2576, confidence: null},
            {text: " shows", startMs: 2676, endMs: 3178, timestampMs: 2927, confidence: null},
            {text: " how", startMs: 3178, endMs: 3479, timestampMs: 3329, confidence: null},
            {text: " much", startMs: 3479, endMs: 3881, timestampMs: 3680, confidence: null},
            {text: " one", startMs: 3881, endMs: 4182, timestampMs: 4032, confidence: null},
            {text: " Moon", startMs: 4182, endMs: 4584, timestampMs: 4383, confidence: null},
            {text: " shapes", startMs: 4584, endMs: 5187, timestampMs: 4886, confidence: null},
            {text: " our", startMs: 5187, endMs: 5488, timestampMs: 5338, confidence: null},
            {text: " world.", startMs: 5488, endMs: 6072, timestampMs: 5780, confidence: null}
          ]} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <FilmLook name="Film look" vignette={0.5} grain={0.06} tint="#c9b6ff" tintAmount={0} />
      <Track name="Music">
        <MusicBed name="Music" src={staticFile("demo-two-moons/audio/background-music.mp3")} volume={0.18} duckTo={0.072} fadeInSeconds={1} fadeOutSeconds={2} muted={false} duckRanges={[]} />
      </Track>
      <Track name="Sound effects">
        {/* no sound effects */}
      </Track>
    </>
  );
};
