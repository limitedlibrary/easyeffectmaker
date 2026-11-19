import type { AppState } from '../state/AppState';

function formatTime(t: number): string {
  return t.toFixed(2) + 's';
}

export class Timeline {
  readonly el: HTMLElement;
  private playPauseBtn: HTMLButtonElement;
  private loopBtn: HTMLButtonElement;
  private scrubber: HTMLInputElement;
  private timeLabel: HTMLSpanElement;
  private speedSelect: HTMLSelectElement;
  private scrubbing = false;

  constructor(private state: AppState) {
    this.el = document.createElement('div');
    this.el.className = 'timeline';

    const restartBtn = this.makeButton('⏮', '最初から再生', () => this.state.restart());
    this.playPauseBtn = this.makeButton('⏸', '再生/一時停止', () => {
      if (this.state.playback.playing) this.state.pause();
      else this.state.play();
    });
    const stopBtn = this.makeButton('⏹', '停止', () => this.state.stop());
    this.loopBtn = this.makeButton('🔁', 'ループ再生', () => {
      this.state.doc.loop = !this.state.doc.loop;
      this.state.notifyMeta();
    });

    this.speedSelect = document.createElement('select');
    this.speedSelect.className = 'speed-select';
    for (const s of [0.25, 0.5, 1, 1.5, 2, 4]) {
      const opt = document.createElement('option');
      opt.value = String(s);
      opt.textContent = `${s}x`;
      this.speedSelect.appendChild(opt);
    }
    this.speedSelect.value = String(this.state.playback.speed);
    this.speedSelect.addEventListener('change', () => this.state.setSpeed(parseFloat(this.speedSelect.value)));

    this.scrubber = document.createElement('input');
    this.scrubber.type = 'range';
    this.scrubber.className = 'scrubber';
    this.scrubber.min = '0';
    this.scrubber.step = '0.01';
    this.scrubber.addEventListener('pointerdown', () => (this.scrubbing = true));
    this.scrubber.addEventListener('pointerup', () => (this.scrubbing = false));
    this.scrubber.addEventListener('input', () => this.state.seek(parseFloat(this.scrubber.value)));

    this.timeLabel = document.createElement('span');
    this.timeLabel.className = 'time-label';

    const controls = document.createElement('div');
    controls.className = 'transport-controls';
    controls.appendChild(restartBtn);
    controls.appendChild(this.playPauseBtn);
    controls.appendChild(stopBtn);
    controls.appendChild(this.loopBtn);
    controls.appendChild(this.speedSelect);
    controls.appendChild(this.timeLabel);

    this.el.appendChild(controls);
    this.el.appendChild(this.scrubber);

    this.syncFromDoc();
    this.tick();

    state.on('meta', () => this.syncFromDoc());
    state.on('structure', () => this.syncFromDoc());
  }

  private makeButton(icon: string, title: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'transport-btn';
    btn.title = title;
    btn.textContent = icon;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private syncFromDoc(): void {
    this.scrubber.max = String(this.state.doc.durationSec);
    this.loopBtn.classList.toggle('active', this.state.doc.loop);
  }

  /** Called every animation frame from main.ts to reflect current playback position. */
  tick(): void {
    this.playPauseBtn.textContent = this.state.playback.playing ? '⏸' : '▶';
    this.timeLabel.textContent = `${formatTime(this.state.playback.time)} / ${formatTime(this.state.doc.durationSec)}`;
    if (!this.scrubbing) {
      this.scrubber.value = String(this.state.playback.time);
    }
  }
}
