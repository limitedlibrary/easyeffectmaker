import type { AppState } from '../state/AppState';
import { PRESETS } from '../core/presets';
import { parseDocument, serializeDocument } from '../io/jsonIO';
import { downloadTextFile, pickTextFile } from './fileIO';
import {
  checkboxControl,
  colorControl,
  numberControl,
  sectionEl,
  selectControl,
  sliderControl,
  textControl,
  vectorControl,
} from './controls';
import type { BulletShape, SpawnAnim, TrailMode } from '../core/types';
import { FRAME_RATE_OPTIONS, LIMITS } from '../core/limits';

export interface PanelCallbacks {
  isFreeCamera(): boolean;
  setFreeCamera(v: boolean): void;
}

export class Panel {
  readonly el: HTMLElement;

  constructor(private state: AppState, private callbacks: PanelCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.renderAll();
    state.on('structure', () => this.renderAll());
  }

  private renderAll(): void {
    this.el.innerHTML = '';
    this.el.appendChild(this.buildPresetSection());
    this.el.appendChild(this.buildGlobalSection());
    this.el.appendChild(this.buildLayerSection());
    this.el.appendChild(this.buildEmitterSection());
    this.el.appendChild(this.buildBulletSection());
    this.el.appendChild(this.buildStageSection());
    this.el.appendChild(this.buildIoSection());
  }

  private buildPresetSection(): HTMLElement {
    const section = sectionEl('プリセット');
    const grid = document.createElement('div');
    grid.className = 'preset-grid';
    for (const preset of PRESETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => this.state.replaceDoc(preset.build()));
      grid.appendChild(btn);
    }
    section.appendChild(grid);
    return section;
  }

  private buildGlobalSection(): HTMLElement {
    const section = sectionEl('全体設定');
    const { doc } = this.state;

    section.appendChild(textControl('エフェクト名', doc.name, (v) => (doc.name = v)).el);
    section.appendChild(
      sliderControl('再生時間(秒)', doc.durationSec, ...LIMITS.doc.durationSec, 0.5, (v) => {
        doc.durationSec = v;
        this.state.notifyMeta();
      }).el,
    );
    section.appendChild(
      selectControl(
        'フレームレート',
        String(doc.frameRate) as any,
        FRAME_RATE_OPTIONS.map((v) => ({ value: String(v) as any, label: `${v} fps` })),
        (v) => (doc.frameRate = Number(v)),
      ).el,
    );
    section.appendChild(numberControl('乱数シード', doc.seed, (v) => (doc.seed = Math.round(v)), { step: 1 }).el);
    section.appendChild(
      checkboxControl('ループ再生', doc.loop, (v) => {
        doc.loop = v;
        this.state.notifyMeta();
      }).el,
    );
    return section;
  }

  private buildLayerSection(): HTMLElement {
    const section = sectionEl('レイヤー');
    const list = document.createElement('div');
    list.className = 'layer-list';

    for (const layer of this.state.doc.layers) {
      const row = document.createElement('div');
      row.className = 'layer-row' + (layer.id === this.state.activeLayerId ? ' active' : '');

      const visible = document.createElement('input');
      visible.type = 'checkbox';
      visible.checked = layer.visible;
      visible.title = '表示';
      visible.addEventListener('change', () => (layer.visible = visible.checked));
      row.appendChild(visible);

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'layer-name';
      name.value = layer.name;
      name.addEventListener('input', () => (layer.name = name.value));
      name.addEventListener('focus', () => this.state.setActiveLayer(layer.id));
      row.appendChild(name);

      const dupBtn = document.createElement('button');
      dupBtn.type = 'button';
      dupBtn.className = 'icon-btn';
      dupBtn.title = '複製';
      dupBtn.textContent = '⧉';
      dupBtn.addEventListener('click', () => this.state.duplicateLayer(layer.id));
      row.appendChild(dupBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'icon-btn';
      delBtn.title = '削除';
      delBtn.textContent = '✕';
      delBtn.disabled = this.state.doc.layers.length <= 1;
      delBtn.addEventListener('click', () => this.state.removeLayer(layer.id));
      row.appendChild(delBtn);

      row.addEventListener('click', (e) => {
        if (e.target === visible || e.target === name || e.target === dupBtn || e.target === delBtn) return;
        this.state.setActiveLayer(layer.id);
      });

      list.appendChild(row);
    }
    section.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'full-btn';
    addBtn.textContent = '+ レイヤーを追加';
    addBtn.addEventListener('click', () => this.state.addLayer());
    section.appendChild(addBtn);

    return section;
  }

  private buildEmitterSection(): HTMLElement {
    const section = sectionEl('発射設定');
    const layer = this.state.activeLayer;
    const emitter = layer.emitter;

    section.appendChild(
      sliderControl('開始遅延(秒)', layer.startDelaySec, ...LIMITS.layer.startDelaySec, 0.1, (v) => (layer.startDelaySec = v)).el,
    );
    section.appendChild(sliderControl('同時発射数', emitter.count, ...LIMITS.emitter.count, 1, (v) => (emitter.count = Math.round(v))).el);
    section.appendChild(sliderControl('発射間隔(秒)', emitter.interval, ...LIMITS.emitter.interval, 0.01, (v) => (emitter.interval = v)).el);
    section.appendChild(vectorControl('発射方向', emitter.direction, (v) => (emitter.direction = v)).el);
    section.appendChild(
      sliderControl('拡散角度(度)', emitter.spreadAngleDeg, ...LIMITS.emitter.spreadAngleDeg, 1, (v) => (emitter.spreadAngleDeg = v)).el,
    );
    section.appendChild(vectorControl('回転軸', emitter.rotationAxis, (v) => (emitter.rotationAxis = v)).el);
    section.appendChild(
      sliderControl('発射方向の回転速度(度/秒)', emitter.rotationSpeedDeg, ...LIMITS.emitter.rotationSpeedDeg, 1, (v) => (emitter.rotationSpeedDeg = v))
        .el,
    );
    section.appendChild(
      sliderControl('波の振幅(度)', emitter.waveAmplitudeDeg, ...LIMITS.emitter.waveAmplitudeDeg, 1, (v) => (emitter.waveAmplitudeDeg = v)).el,
    );
    section.appendChild(
      sliderControl('波の周波数(Hz)', emitter.waveFrequencyHz, ...LIMITS.emitter.waveFrequencyHz, 0.01, (v) => (emitter.waveFrequencyHz = v)).el,
    );
    section.appendChild(vectorControl('波の回転軸', emitter.waveAxis, (v) => (emitter.waveAxis = v)).el);
    section.appendChild(vectorControl('発射位置', emitter.position, (v) => (emitter.position = v), 0.5).el);
    section.appendChild(
      sliderControl('発射継続時間(秒)', emitter.emissionDuration, ...LIMITS.emitter.emissionDuration, 0.1, (v) => (emitter.emissionDuration = v))
        .el,
    );
    section.appendChild(
      sliderControl('方向のばらつき(度)', emitter.azimuthJitterDeg, ...LIMITS.emitter.azimuthJitterDeg, 0.5, (v) => (emitter.azimuthJitterDeg = v))
        .el,
    );
    section.appendChild(
      sliderControl('拡散のばらつき(度)', emitter.spreadJitterDeg, ...LIMITS.emitter.spreadJitterDeg, 0.5, (v) => (emitter.spreadJitterDeg = v))
        .el,
    );
    return section;
  }

  private buildBulletSection(): HTMLElement {
    const section = sectionEl('弾の設定');
    const bullet = this.state.activeLayer.bullet;

    section.appendChild(
      selectControl<BulletShape>(
        '弾の形状',
        bullet.shape,
        [
          { value: 'sphere', label: '球' },
          { value: 'box', label: '直方体' },
          { value: 'octahedron', label: '正八面体' },
          { value: 'sprite', label: '光の粒' },
        ],
        (v) => (bullet.shape = v),
      ).el,
    );
    section.appendChild(sliderControl('大きさ', bullet.size, ...LIMITS.bullet.size, 0.01, (v) => (bullet.size = v)).el);
    section.appendChild(colorControl('色（開始）', bullet.color, (v) => (bullet.color = v)).el);
    section.appendChild(colorControl('色（終了）', bullet.colorEnd, (v) => (bullet.colorEnd = v)).el);
    section.appendChild(sliderControl('移動速度', bullet.speed, ...LIMITS.bullet.speed, 0.1, (v) => (bullet.speed = v)).el);
    section.appendChild(sliderControl('速度のばらつき', bullet.speedJitter, ...LIMITS.bullet.speedJitter, 0.01, (v) => (bullet.speedJitter = v)).el);
    section.appendChild(sliderControl('加速度', bullet.acceleration, ...LIMITS.bullet.acceleration, 0.1, (v) => (bullet.acceleration = v)).el);
    section.appendChild(sliderControl('寿命(秒)', bullet.lifetime, ...LIMITS.bullet.lifetime, 0.1, (v) => (bullet.lifetime = v)).el);
    section.appendChild(sliderControl('発光強度', bullet.glowIntensity, ...LIMITS.bullet.glowIntensity, 0.1, (v) => (bullet.glowIntensity = v)).el);
    section.appendChild(
      selectControl<TrailMode>(
        '軌跡の有無',
        bullet.trail,
        [
          { value: 'none', label: 'なし' },
          { value: 'line', label: 'あり' },
        ],
        (v) => (bullet.trail = v),
      ).el,
    );
    section.appendChild(
      sliderControl('軌跡の長さ(秒)', bullet.trailDurationSec, ...LIMITS.bullet.trailDurationSec, 0.05, (v) => (bullet.trailDurationSec = v)).el,
    );
    return section;
  }

  private buildStageSection(): HTMLElement {
    const section = sectionEl('演出設定');
    const { stage, camera } = this.state.doc;
    const bullet = this.state.activeLayer.bullet;

    section.appendChild(colorControl('背景色', stage.backgroundColor, (v) => (stage.backgroundColor = v)).el);

    section.appendChild(checkboxControl('Bloom（発光表現）を有効化', stage.bloom.enabled, (v) => (stage.bloom.enabled = v)).el);
    section.appendChild(sliderControl('Bloomの強さ', stage.bloom.strength, ...LIMITS.stage.bloomStrength, 0.05, (v) => (stage.bloom.strength = v)).el);
    section.appendChild(sliderControl('Bloomの範囲', stage.bloom.radius, ...LIMITS.stage.bloomRadius, 0.01, (v) => (stage.bloom.radius = v)).el);
    section.appendChild(
      sliderControl('Bloomのしきい値', stage.bloom.threshold, ...LIMITS.stage.bloomThreshold, 0.01, (v) => (stage.bloom.threshold = v)).el,
    );

    section.appendChild(checkboxControl('発射時の光を有効化', stage.muzzleFlash.enabled, (v) => (stage.muzzleFlash.enabled = v)).el);
    section.appendChild(colorControl('発射時の光の色', stage.muzzleFlash.color, (v) => (stage.muzzleFlash.color = v)).el);
    section.appendChild(
      sliderControl('発射時の光の強さ', stage.muzzleFlash.intensity, ...LIMITS.stage.muzzleIntensity, 0.1, (v) => (stage.muzzleFlash.intensity = v))
        .el,
    );
    section.appendChild(
      sliderControl(
        '発射時の光の持続時間(秒)',
        stage.muzzleFlash.durationSec,
        ...LIMITS.stage.muzzleDurationSec,
        0.01,
        (v) => (stage.muzzleFlash.durationSec = v),
      ).el,
    );
    section.appendChild(
      sliderControl('発射時の光の大きさ', stage.muzzleFlash.size, ...LIMITS.stage.muzzleSize, 0.05, (v) => (stage.muzzleFlash.size = v)).el,
    );

    section.appendChild(
      selectControl<SpawnAnim>(
        '弾の出現・消滅演出（選択中レイヤー）',
        bullet.spawnAnim,
        [
          { value: 'none', label: 'なし' },
          { value: 'fade', label: 'フェード' },
          { value: 'scale', label: '拡大縮小' },
          { value: 'fadeScale', label: 'フェード＋拡大縮小' },
        ],
        (v) => (bullet.spawnAnim = v),
      ).el,
    );
    section.appendChild(
      sliderControl('出現時間の割合', bullet.spawnAnimFrac, ...LIMITS.bullet.spawnAnimFrac, 0.01, (v) => (bullet.spawnAnimFrac = v)).el,
    );
    section.appendChild(
      sliderControl('消滅時間の割合', bullet.despawnAnimFrac, ...LIMITS.bullet.despawnAnimFrac, 0.01, (v) => (bullet.despawnAnimFrac = v)).el,
    );

    section.appendChild(vectorControl('カメラ位置', camera.position, (v) => (camera.position = v), 0.5).el);
    section.appendChild(vectorControl('カメラ注視点', camera.target, (v) => (camera.target = v), 0.5).el);
    section.appendChild(sliderControl('カメラ視野角(度)', camera.fovDeg, ...LIMITS.camera.fovDeg, 1, (v) => (camera.fovDeg = v)).el);
    section.appendChild(
      sliderControl('カメラの回転速度(度/秒)', camera.orbitSpeedDeg, ...LIMITS.camera.orbitSpeedDeg, 1, (v) => (camera.orbitSpeedDeg = v)).el,
    );
    section.appendChild(vectorControl('カメラの回転軸', camera.orbitAxis, (v) => (camera.orbitAxis = v)).el);

    const freeCam = checkboxControl('フリーカメラ（マウスでプレビュー操作、保存されません）', this.callbacks.isFreeCamera(), (v) =>
      this.callbacks.setFreeCamera(v),
    );
    section.appendChild(freeCam.el);

    return section;
  }

  private buildIoSection(): HTMLElement {
    const section = sectionEl('JSON 書き出し・読み込み');

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.className = 'full-btn';
    exportBtn.textContent = 'JSONを書き出す';
    exportBtn.addEventListener('click', () => {
      const name = this.state.doc.name.trim() || 'effect';
      downloadTextFile(`${name}.json`, serializeDocument(this.state.doc));
    });
    section.appendChild(exportBtn);

    const importBtn = document.createElement('button');
    importBtn.type = 'button';
    importBtn.className = 'full-btn';
    importBtn.textContent = 'JSONを読み込む';
    importBtn.addEventListener('click', async () => {
      const text = await pickTextFile('.json,application/json');
      if (!text) return;
      const { doc, errors } = parseDocument(text, this.state.doc);
      this.state.replaceDoc(doc);
      if (errors.length > 0) {
        // eslint-disable-next-line no-alert
        alert(errors.join('\n'));
      }
    });
    section.appendChild(importBtn);

    const note = document.createElement('p');
    note.className = 'io-note';
    note.textContent = 'JSONの仕様は docs/json-spec.md を参照してください。将来、このJSONをBlender側のPythonスクリプトで読み込み、同じ弾幕を再現する予定です。';
    section.appendChild(note);

    return section;
  }
}
