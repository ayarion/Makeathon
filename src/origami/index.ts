import { buildModel, type Model, type Pose, type Spec } from './engine.ts';
import { CLIPS, mixPose, type Clip } from './anim.ts';
import { rabbit } from './rabbit.ts';
import { crane } from './crane.ts';
import { fox } from './fox.ts';

export type AnimalId = 'rabbit' | 'crane' | 'fox';
/** The five paper colours of the app (Figma logo palette) as keyed by the task store. */
export type PaperId = 'peach' | 'blue' | 'sage' | 'orange' | 'purple';
/** Front face, reverse side, lit paper edge and edge shadow for each sheet colour. */
export const PAPERS: Record<PaperId, { paper: number; reverse: number; light: number; dark: number }> = {
  orange: { paper: 0xf24e1e, reverse: 0xff7262, light: 0xffb3a0, dark: 0x5a1505 },
  peach: { paper: 0xff7262, reverse: 0xf24e1e, light: 0xffc4b8, dark: 0x5e1a10 },
  purple: { paper: 0xa259ff, reverse: 0xff7262, light: 0xd2b0ff, dark: 0x2c1257 },
  blue: { paper: 0x1abcfe, reverse: 0x0acf83, light: 0xa6e6ff, dark: 0x053a52 },
  sage: { paper: 0x0acf83, reverse: 0x1abcfe, light: 0x8ff0c8, dark: 0x033d27 },
};
/** Colour used when a caller does not say which sheet the animal was folded from. */
export const DEFAULT_PAPER: Record<AnimalId, PaperId> = { crane: 'orange', rabbit: 'purple', fox: 'sage' };
const BASE: Record<AnimalId, Spec> = { rabbit, crane, fox };
const withPaper = (spec: Spec, id: PaperId): Spec => {
  const { paper, reverse, light, dark } = PAPERS[id];
  return { ...spec, rig: { ...spec.rig, paper, reverse, edge: { light, dark } } };
};
export const SPECS: Record<AnimalId, Spec> = {
  rabbit: withPaper(rabbit, DEFAULT_PAPER.rabbit),
  crane: withPaper(crane, DEFAULT_PAPER.crane),
  fox: withPaper(fox, DEFAULT_PAPER.fox),
};

export type Loop = 'idle' | 'run';
/** One-shot actions per animal. `caught` unfolds into a flat sheet and stays there until play()/fold(). */
export const EMOTES = {
  rabbit: ['jump', 'lookBack', 'caught'],
  fox: ['pounce', 'lookBack', 'caught'],
  crane: ['flap', 'bow', 'caught'],
} as const satisfies Record<AnimalId, readonly string[]>;
export type Emote<A extends AnimalId = AnimalId> = (typeof EMOTES)[A][number];

/** Ground speed (height units per second) that roughly matches each run cycle's stride. */
export const RUN_SPEED: Record<AnimalId, number> = { rabbit: 1.5, fox: 1.7, crane: 1.2 };

export interface OrigamiAnimal extends Model {
  readonly id: AnimalId;
  /** Switch the looping state (cross-fades over 0.2 s). */
  play(loop: Loop): void;
  /** Play a one-shot on top of the loop; returns its length in seconds. */
  emote(name: string): number;
  /** Start as a flat square sheet and fold up into the animal; returns the length in seconds. */
  fold(): number;
  /**
   * Take manual control of the fold (1 = animal, 0 = flat sheet) and ease to `target` over `seconds`.
   * Used for the step-by-step unfolding; play()/emote()/fold() hand control back to the clips.
   */
  unfoldTo(target: number, seconds?: number): void;
  /** Advance by dt seconds and pose the paper. Call once per frame. */
  update(dt: number): void;
  readonly loop: Loop;
  /** The running one-shot, or null. */
  readonly action: string | null;
}

const FADE = 0.2;

/**
 * Build one origami animal for a game.
 * `group` faces +Z with its feet on y = 0 and is 1 unit tall; move and rotate it freely.
 */
export function createOrigamiAnimal(id: AnimalId, paper: PaperId = DEFAULT_PAPER[id]): OrigamiAnimal {
  const model = buildModel(withPaper(BASE[id], PAPERS[paper] ? paper : DEFAULT_PAPER[id]));
  const clips = CLIPS[id] as Record<string, Clip>;
  let loop: Loop = 'idle', prevLoop: Loop = 'idle';
  let loopT = 0, prevT = 0, loopFade = 1;
  let action: string | null = null, actionT = 0;
  let manual: { from: number; to: number; t: number; length: number } | null = null;
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

  const loopPose = (): Pose => {
    const cur = clips[loop].pose(loopT);
    return loopFade < 1 ? mixPose(clips[prevLoop].pose(prevT), cur, loopFade) : cur;
  };

  const self: OrigamiAnimal = {
    ...model,
    id,
    get loop() { return loop; },
    get foldAmount() { return model.foldAmount; },
    get action() { return action; },
    play(next) {
      manual = null;
      if (action && clips[action].hold) action = null;
      if (next === loop) return;
      prevLoop = loop; prevT = loopT;
      loop = next; loopT = 0; loopFade = 0;
    },
    emote(name) {
      if (!clips[name] || name === 'idle' || name === 'run') throw new Error(`origami: no emote "${name}" for ${id}`);
      manual = null;
      action = name; actionT = 0;
      return clips[name].duration;
    },
    fold() { return self.emote('fold'); },
    unfoldTo(target, seconds = 0.7) {
      action = null;
      const from = model.foldAmount;
      manual = { from, to: Math.min(1, Math.max(0, target)), t: 0, length: Math.max(0, seconds) };
    },
    update(dt) {
      loopT += dt; prevT += dt;
      loopFade = Math.min(1, loopFade + dt / FADE);
      let pose = loopPose();
      if (manual) {
        manual.t += dt;
        const k = manual.length ? ease(manual.t / manual.length) : 1;
        // a little startled squash while the paper gives way
        const squash = manual.length ? Math.sin(Math.PI * Math.min(1, manual.t / manual.length)) : 0;
        model.setPose({ ...pose, fold: manual.from + (manual.to - manual.from) * k, root: { ...pose.root, dy: (pose.root?.dy ?? 0) - 0.03 * squash } });
        return;
      }
      if (action) {
        const clip = clips[action];
        actionT += dt;
        if (actionT >= clip.duration && !clip.hold) action = null;
        else {
          const t = Math.min(actionT, clip.duration);
          // ease in and out of the one-shot so it never pops
          const w = clip.hold ? Math.min(1, t / FADE) : Math.min(1, t / FADE, (clip.duration - t) / FADE);
          pose = mixPose(pose, clip.pose(t), action === 'fold' || action === 'caught' ? 1 : w);
        }
      }
      model.setPose(pose);
    },
  };
  return self;
}
