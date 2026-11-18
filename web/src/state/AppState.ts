import type { EffectDocument } from '../core/types';
import { createDefaultDocument, makeLayer, nextLayerId } from '../core/presets';

export interface PlaybackState {
  playing: boolean;
  time: number;
  speed: number;
}

type Listener = () => void;

/**
 * Single mutable source of truth for the whole app. Structural changes
 * (document replaced, layer added/removed/selected, duration/loop edited)
 * fire the 'structure' event so the settings panel and timeline can resync
 * their DOM. Plain parameter edits made through the panel mutate `doc`
 * in place and do not need an event — the render loop reads `doc` fresh
 * every frame regardless.
 */
export class AppState {
  doc: EffectDocument = createDefaultDocument();
  activeLayerId: string = this.doc.layers[0].id;
  playback: PlaybackState = { playing: true, time: 0, speed: 1 };

  private listeners: Record<string, Listener[]> = { structure: [], playback: [], meta: [] };

  on(event: 'structure' | 'playback' | 'meta', cb: Listener): () => void {
    this.listeners[event].push(cb);
    return () => {
      this.listeners[event] = this.listeners[event].filter((l) => l !== cb);
    };
  }

  private emit(event: 'structure' | 'playback' | 'meta'): void {
    for (const l of this.listeners[event]) l();
  }

  notifyStructure(): void {
    this.emit('structure');
  }

  /** For doc-level edits (duration, loop, ...) that other UI pieces (Timeline) must resync to, without a full panel rebuild. */
  notifyMeta(): void {
    this.emit('meta');
  }

  replaceDoc(doc: EffectDocument): void {
    this.doc = doc;
    this.activeLayerId = doc.layers[0]?.id ?? '';
    this.playback.time = 0;
    this.emit('structure');
  }

  get activeLayer() {
    return this.doc.layers.find((l) => l.id === this.activeLayerId) ?? this.doc.layers[0];
  }

  setActiveLayer(id: string): void {
    this.activeLayerId = id;
    this.emit('structure');
  }

  addLayer(): void {
    const layer = makeLayer(`レイヤー ${this.doc.layers.length + 1}`);
    this.doc.layers.push(layer);
    this.activeLayerId = layer.id;
    this.emit('structure');
  }

  duplicateLayer(id: string): void {
    const src = this.doc.layers.find((l) => l.id === id);
    if (!src) return;
    const clone = structuredClone(src);
    clone.id = nextLayerId();
    clone.name = `${src.name} のコピー`;
    const idx = this.doc.layers.findIndex((l) => l.id === id);
    this.doc.layers.splice(idx + 1, 0, clone);
    this.activeLayerId = clone.id;
    this.emit('structure');
  }

  removeLayer(id: string): void {
    if (this.doc.layers.length <= 1) return;
    const idx = this.doc.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    this.doc.layers.splice(idx, 1);
    if (this.activeLayerId === id) {
      this.activeLayerId = this.doc.layers[Math.max(0, idx - 1)].id;
    }
    this.emit('structure');
  }

  play(): void {
    this.playback.playing = true;
    this.emit('playback');
  }

  pause(): void {
    this.playback.playing = false;
    this.emit('playback');
  }

  stop(): void {
    this.playback.playing = false;
    this.playback.time = 0;
    this.emit('playback');
  }

  restart(): void {
    this.playback.time = 0;
    this.playback.playing = true;
    this.emit('playback');
  }

  seek(t: number): void {
    this.playback.time = Math.max(0, Math.min(this.doc.durationSec, t));
    this.emit('playback');
  }

  setSpeed(speed: number): void {
    this.playback.speed = speed;
    this.emit('playback');
  }

  /** Advances playback time, looping or clamping at the end. Called from the render loop. */
  advance(dtSeconds: number): void {
    if (!this.playback.playing) return;
    let t = this.playback.time + dtSeconds * this.playback.speed;
    if (t >= this.doc.durationSec) {
      if (this.doc.loop) {
        t = this.doc.durationSec > 0 ? t % this.doc.durationSec : 0;
      } else {
        t = this.doc.durationSec;
        this.playback.playing = false;
      }
    }
    this.playback.time = t;
  }
}
