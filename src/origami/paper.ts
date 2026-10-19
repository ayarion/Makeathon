import * as THREE from 'three';

/** Seeded PRNG so every build of the paper looks the same. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Washi-like paper: soft cloudy mottling plus long thin fibres.
 * Returns a colour map (multiplied with the material colour) and a bump map.
 */
export function paperTextures(seed = 7): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 1024;
  const rand = rng(seed);
  const make = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const colour = make();
  const bump = make();
  const g = colour.getContext('2d')!;
  const b = bump.getContext('2d')!;
  // Base a little below white so fibres can read lighter than the paper, even on coloured sheets.
  g.fillStyle = '#dedede';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  // Cloudy mottling: many large, very faint blobs (wrapped so the tile repeats).
  const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rgba: string) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      const grad = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grad.addColorStop(0, rgba);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    }
  };
  for (let i = 0; i < 260; i++) {
    const x = rand() * size, y = rand() * size, r = 20 + rand() * 120;
    blob(g, x, y, r, rand() < 0.5 ? 'rgba(150,120,80,0.008)' : 'rgba(255,255,255,0.03)');
  }

  // Fibres: long, slightly curved strokes; light on the colour map, raised on the bump map.
  const fibre = (n: number, len: number, width: number, alphaC: number, alphaB: number) => {
    for (let i = 0; i < n; i++) {
      let x = rand() * size, y = rand() * size;
      let a = rand() * Math.PI * 2;
      const steps = 6 + Math.floor(rand() * 10);
      const seg = (len * (0.4 + rand())) / steps;
      const light = rand() < 0.7;
      g.strokeStyle = light ? `rgba(255,255,255,${alphaC})` : `rgba(150,120,80,${alphaC * 0.35})`;
      b.strokeStyle = `rgba(255,255,255,${alphaB})`;
      g.lineWidth = b.lineWidth = width * (0.5 + rand());
      g.beginPath(); b.beginPath();
      g.moveTo(x, y); b.moveTo(x, y);
      for (let s = 0; s < steps; s++) {
        a += (rand() - 0.5) * 0.6;
        x += Math.cos(a) * seg; y += Math.sin(a) * seg;
        g.lineTo(x, y); b.lineTo(x, y);
      }
      g.stroke(); b.stroke();
    }
  };
  fibre(1400, 60, 0.9, 0.12, 0.25);
  fibre(500, 140, 1.4, 0.08, 0.2);
  fibre(5000, 10, 0.7, 0.10, 0.18);

  // Fine grain on both maps.
  const gi = g.getImageData(0, 0, size, size);
  const bi = b.getImageData(0, 0, size, size);
  for (let i = 0; i < gi.data.length; i += 4) {
    const n = (rand() - 0.5) * 10;
    gi.data[i] += n; gi.data[i + 1] += n; gi.data[i + 2] += n;
    const m = (rand() - 0.5) * 40;
    bi.data[i] += m; bi.data[i + 1] += m; bi.data[i + 2] += m;
  }
  g.putImageData(gi, 0, 0);
  b.putImageData(bi, 0, 0);

  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpTex = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpTex]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, bump: bumpTex };
}

let shared: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } | null = null;
/** The washi maps are deterministic and costly to draw, so every model shares one pair (never disposed). */
export function sharedPaperTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  return (shared ??= paperTextures());
}
