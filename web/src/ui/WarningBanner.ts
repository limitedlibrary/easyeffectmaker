import type { FrameRenderStats } from '../render/EffectRenderer';

/**
 * Floating banner over the 3D viewport that tells the user when the
 * simulation computed more bullets/trails than the renderer's capacity, so
 * what's on screen is known to differ from the simulated result (rather
 * than silently dropping bullets with no indication).
 */
export class WarningBanner {
  readonly el: HTMLElement;
  private textEl: HTMLElement;
  private lastKey = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'render-warning';
    this.el.hidden = true;
    this.textEl = document.createElement('span');
    this.el.appendChild(this.textEl);
  }

  update(stats: FrameRenderStats): void {
    const messages: string[] = [];
    if (stats.bullets.rendered < stats.bullets.computed) {
      messages.push(`弾 ${stats.bullets.computed}→${stats.bullets.rendered}個`);
    }
    if (stats.trails.rendered < stats.trails.computed) {
      messages.push(`軌跡 ${stats.trails.computed}→${stats.trails.rendered}本`);
    }

    const key = messages.join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;

    if (messages.length === 0) {
      this.el.hidden = true;
      return;
    }
    this.el.hidden = false;
    this.textEl.textContent = `⚠ 描画上限を超えたため間引いて表示しています（${messages.join(' / ')}）。発射間隔を広げる・寿命や同時発射数を減らすと解消します。`;
  }
}
