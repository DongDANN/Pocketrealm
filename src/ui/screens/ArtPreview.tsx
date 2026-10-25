import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildWarden } from '../../art/companion';
import { buildTollbug } from '../../art/enemies';
import { C } from '../../art/palette';
import { blit, createPixmap, type Pixmap } from '../../art/px';
import { composeRoomPreview, SCENE_H, SCENE_W } from '../../art/scenes/rootfall';
import { FLAME_FRAMES, TORCH } from '../../art/tiles';
import { AnimatedPixmap } from '../components/AnimatedPixmap';
import { PixelText } from '../components/PixelText';
import { useMediaQuery, usePrefersReducedMotion } from '../hooks/useMediaQuery';

const ROOM_FRAME_MS = 100;
const ROOM_FRAME_COUNT = 12;

const TORCH_FRAMES: Pixmap[] = FLAME_FRAMES.map((flame) => {
  const out = createPixmap(24, 28, C.ink500);
  blit(out, TORCH, 4, 4);
  blit(out, flame, 4, 0);
  return out;
});

function fps(frameMs: number): number {
  return Math.round(1000 / frameMs);
}

interface CardProps {
  title: string;
  blurb: string;
  frames: readonly Pixmap[];
  frameMs: number;
  scale: number;
  playing: boolean;
  step: number;
}

function SpriteCard({ title, blurb, frames, frameMs, scale, playing, step }: CardProps) {
  return (
    <article className="panel sprite-card">
      <div className="sprite-art">
        <AnimatedPixmap
          frames={frames}
          frameMs={frameMs}
          scale={scale}
          playing={playing}
          step={step}
          alt={`${title} animation, ${frames.length} frames`}
          className="pixel-canvas"
        />
      </div>
      <div className="sprite-copy">
        <h2>
          <PixelText text={title} color={C.paper0} pixelScale={3} wrap={18} />
        </h2>
        <p>
          <PixelText text={blurb} color={C.paper3} pixelScale={2} wrap={30} />
        </p>
        <p className="sprite-meta">
          <PixelText
            text={`${frames.length} frames · ${fps(frameMs)} fps`}
            color={C.amber3}
            pixelScale={2}
            wrap={24}
          />
        </p>
      </div>
    </article>
  );
}

export function ArtPreview() {
  const reducedMotion = usePrefersReducedMotion();
  const wide = useMediaQuery('(min-width: 760px)');
  const [playing, setPlaying] = useState(!reducedMotion);
  const [step, setStep] = useState(0);
  const [roomFrame, setRoomFrame] = useState(0);

  useEffect(() => {
    if (reducedMotion) setPlaying(false);
  }, [reducedMotion]);

  const roomFrames = useMemo(
    () => Array.from({ length: ROOM_FRAME_COUNT }, (_, i) => composeRoomPreview(i)),
    [],
  );
  const warden = useMemo(() => buildWarden(), []);
  const tollbug = useMemo(() => buildTollbug(), []);

  const roomScale = wide ? 2 : 1;
  const spriteScale = wide ? 4 : 3;
  const bugScale = wide ? 5 : 4;
  const torchScale = 6;

  const handleStep = () => {
    setPlaying(false);
    setStep((value) => value + 1);
  };

  return (
    <main className="shell art-shell">
      <header className="art-top">
        <Link className="back-link" to="/">
          <PixelText text="← Pocketrealm" color={C.amber2} pixelScale={2} />
        </Link>
        <p className="art-badge">
          <PixelText text="Gate 0.5 · style lock" color={C.paper3} pixelScale={2} />
        </p>
      </header>

      <div className="art-intro">
        <h1 className="art-title">
          <PixelText
            text="Rootfall, in motion"
            color={C.paper0}
            pixelScale={wide ? 5 : 4}
            wrap={26}
          />
        </h1>
        <p className="art-lede">
          <PixelText
            text="Authored in code, one pixel at a time. Every frame uses the same locked palette. No bitmaps, no stock assets."
            color={C.paper2}
            pixelScale={2}
            wrap={40}
          />
        </p>
      </div>

      <section className="panel stage-panel" aria-labelledby="stage-title">
        <div className="stage-label">
          <h2 id="stage-title">
            <PixelText text="Rootfall Warren" color={C.paper0} pixelScale={3} wrap={24} />
          </h2>
          <span>
            <PixelText
              text={`${SCENE_W}x${SCENE_H} · ${ROOM_FRAME_COUNT} frames`}
              color={C.paper3}
              pixelScale={2}
            />
          </span>
        </div>
        <div className="stage-frame">
          <AnimatedPixmap
            frames={roomFrames}
            frameMs={ROOM_FRAME_MS}
            scale={roomScale}
            playing={playing}
            step={step}
            onFrame={setRoomFrame}
            alt="Animated lantern-lit cave chamber with two torches, a mossling warden and a tollbug"
            className="pixel-canvas"
          />
        </div>
        <div className="stage-controls">
          <button
            type="button"
            className="pixel-button"
            aria-pressed={playing}
            onClick={() => setPlaying((value) => !value)}
          >
            <PixelText text={playing ? 'Pause' : 'Play'} color={C.ink900} pixelScale={2} />
          </button>
          <button
            type="button"
            className="pixel-button secondary"
            onClick={handleStep}
            disabled={playing}
          >
            <PixelText text="Step +1" color={C.paper0} pixelScale={2} />
          </button>
          <p className="stage-readout" aria-live="off">
            <PixelText
              text={`Frame ${String(roomFrame + 1).padStart(2, '0')} / ${ROOM_FRAME_COUNT} · ${fps(ROOM_FRAME_MS)} fps`}
              color={C.paper3}
              pixelScale={2}
            />
          </p>
        </div>
        {(reducedMotion || step > 0) && !playing && (
          <p className="art-note" role="status">
            <PixelText
              text={
                reducedMotion
                  ? 'Reduced motion is on · the loop starts paused. Press Play to watch it anyway.'
                  : 'Paused. Step one frame at a time, or press Play to resume.'
              }
              color={C.amber2}
              pixelScale={2}
              wrap={44}
            />
          </p>
        )}
      </section>

      <section className="cast" aria-labelledby="cast-title">
        <h2 id="cast-title" className="cast-title">
          <PixelText text="The cast" color={C.paper1} pixelScale={3} />
        </h2>
        <div className="cast-grid">
          <SpriteCard
            title="Mossling Warden"
            blurb="Idle bob, lantern sway and a slow blink. Six frames drawn from a part-based rig."
            frames={warden.idle}
            frameMs={150}
            scale={spriteScale}
            playing={playing}
            step={step}
          />
          <SpriteCard
            title="Warden strike"
            blurb="Wind-up, lantern smash, impact burst and recovery. The trail stays behind the staff."
            frames={warden.attack}
            frameMs={90}
            scale={spriteScale}
            playing={playing}
            step={step}
          />
          <SpriteCard
            title="Tollbug"
            blurb="A coin-shelled scavenger. Antennae twitch and the shell glints in the torchlight."
            frames={tollbug.idle}
            frameMs={150}
            scale={bugScale}
            playing={playing}
            step={step}
          />
          <SpriteCard
            title="Tollbug lunge"
            blurb="Coins shift, legs scramble, and a small spark answers the lantern."
            frames={tollbug.attack}
            frameMs={100}
            scale={bugScale}
            playing={playing}
            step={step}
          />
          <SpriteCard
            title="Wall torch"
            blurb="Three flame frames, offset on each wall so the room never pulses in unison."
            frames={TORCH_FRAMES}
            frameMs={100}
            scale={torchScale}
            playing={playing}
            step={step}
          />
        </div>
      </section>

      <footer className="art-footer">
        <PixelText
          text="Preview only. Sprites pause with PAUSE and honour reduced motion. GIF versions live in docs/art-preview/."
          color={C.paper3}
          pixelScale={2}
          wrap={46}
          align="center"
        />
      </footer>
    </main>
  );
}
