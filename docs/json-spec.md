# エフェクトJSON仕様書（rotating_barrage / v1.0.0）

このドキュメントは、`web/` アプリが書き出す／読み込む JSON ファイルの正式な仕様です。
将来実装する Blender 用 Python スクリプトが **Three.js 側と全く同じ弾幕の動き**
を再現できるよう、座標系・単位・乱数・軌道計算式をビット単位で厳密に定義します。

対応する実装（Three.js 側・正）:

- 型定義: `web/src/core/types.ts`
- ベクトル演算: `web/src/core/math.ts`
- 乱数: `web/src/core/random.ts`
- シミュレーション本体: `web/src/core/effects/rotatingBarrage.ts`

これらのファイルはレンダラ（Three.js）に一切依存しない、純粋な計算コードです。
Blender 連携を実装する際は、この4ファイルのロジックを Python に移植すれば、
レンダリング方法が変わっても同じ結果が得られます。

サンプルファイル: `samples/*.json`（5つのプリセットをそのまま書き出したもの）。

---

## 1. トップレベル構造

```jsonc
{
  "schemaVersion": "1.0.0",
  "effectType": "rotating_barrage",
  "name": "放射状弾幕",
  "durationSec": 10,
  "frameRate": 30,
  "seed": 11,
  "loop": true,
  "stage": { /* StageConfig, 2章 */ },
  "camera": { /* CameraConfig, 3章 */ },
  "layers": [ /* EffectLayer[], 4章 */ ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `schemaVersion` | string (semver) | このJSONのスキーマバージョン。メジャー番号が同じなら後方互換。 |
| `effectType` | `"rotating_barrage"` | エフェクト種別。将来 `"lightning"` 等が追加される想定の拡張ポイント。 |
| `name` | string | 保存名（UI表示用、計算には使用しない）。 |
| `durationSec` | number > 0 | 全体の再生時間（秒）。 |
| `frameRate` | number > 0 | Blender等でフレーム単位に変換する際の基準フレームレート（fps）。 |
| `seed` | int32 | 乱数シード。同じ `seed` + 同じパラメータ + 同じ時刻なら、常に同じ弾幕状態になる。 |
| `loop` | boolean | プレビューでループ再生するかどうか（書き出しデータの意味には影響しない）。 |

---

## 2. 座標系・単位（最重要）

### 2.1 座標系

- **Three.js（本アプリ内部）**: 右手座標系、**Y-up**。カメラのデフォルト上方向は `+Y`。
- **Blender**: 右手座標系、**Z-up**。

Three.js と glTF は同じ軸規約（右手系・Y-up）であるため、Blender の glTF
インポータが採用している変換式をそのまま使用します。

```
Blender(x, y, z) = Three(x, -z, y)
Three(x, y, z)    = Blender(x, z, -y)
```

JSON内のすべての `Vec3`（位置・方向・軸ベクトル）は **Three.js座標系の値**
としてそのまま保存されています。Blender側で消費する際は、必ず上記変換式を
位置・方向ベクトルの両方（方向ベクトルは平行移動なしの回転のみ適用）に適用
してください。

### 2.2 単位

| 量 | 単位 | 備考 |
|---|---|---|
| 長さ（`position`, `size`, `speed` の空間成分など） | シーン単位 | 1単位 = 1メートル相当として設計。Blenderの既定単位系（メートル）にそのまま読み込んで問題ない。 |
| 角度 | **度（degree）** | JSON内の角度値はすべて度。Three.js内部ではラジアンに変換して計算するが、シリアライズは常に度。 |
| 時間 | 秒（float, 0起点） | `durationSec`、`age`、`shotTime` などすべて秒。 |
| 速度 | 単位/秒 | `speed` |
| 加速度 | 単位/秒² | `acceleration` |
| 角速度 | 度/秒 | `rotationSpeedDeg`, `orbitSpeedDeg` |
| 周波数 | Hz（1/秒） | `waveFrequencyHz` |

### 2.3 フレームと時刻の対応

```
frame_index = round(time_seconds * frameRate)
time_seconds(frame_index) = frame_index / frameRate
```

Blender側でベイクする場合は `frame_index` を `0` から `round(durationSec * frameRate)`
まで回し、各フレームで `time_seconds` を求めて 5章のアルゴリズムを評価する。

---

## 3. StageConfig / CameraConfig

```jsonc
"stage": {
  "backgroundColor": "#05060d",       // CSS hexカラー
  "bloom": {
    "enabled": true,
    "strength": 1.15,                  // Bloomの強さ
    "radius": 0.55,                    // Bloomのにじみ範囲
    "threshold": 0.12                  // この輝度以上が発光対象（Three.js UnrealBloomPass準拠）
  },
  "muzzleFlash": {
    "enabled": true,
    "color": "#ffffff",
    "intensity": 2,
    "durationSec": 0.12,               // 発射時点から何秒間光るか
    "size": 0.5
  }
},
"camera": {
  "position": [0, 2.5, 9],             // 基準カメラ位置（Three.js座標系）
  "target": [0, 0, 0],                 // 注視点。この点を中心にorbitAxis周りで自動回転する
  "fovDeg": 50,                        // 垂直視野角（度）
  "orbitSpeedDeg": 6,                  // target中心の自動回転速度（度/秒）
  "orbitAxis": [0, 1, 0]               // 回転軸（正規化して使用）
}
```

カメラ位置の時間発展式（5.1節の `rotateAroundAxis` を使用）:

```
angle(t)   = orbitSpeedDeg * t                      // 度
camPos(t)  = rotateAroundAxis(position - target, orbitAxis, angle(t)) + target
```

常に `target` を注視する（up = world +Y）。これはプレビュー用の自由カメラ
（OrbitControlsでのマウス操作）とは独立しており、JSONには一切含まれない
プレビュー専用機能。

---

## 4. EffectLayer

1つのエフェクトは複数の `layers` の重ね合わせで構成される（例: 二重回転弾幕は
逆回転する2レイヤー、多層立体弾幕は回転軸の異なる3レイヤー）。各レイヤーは
完全に独立した発射条件・弾設定を持つ。

```jsonc
{
  "id": "layer-1-ab12c",     // 一意なID。乱数ハッシュのキーに使われるため、
                              // インポート時もこの文字列をそのまま保持すること。
  "name": "放射リング",
  "visible": true,
  "startDelaySec": 0,         // このレイヤーのローカル時刻オフセット（秒）
  "emitter": { /* EmitterConfig, 4.1 */ },
  "bullet": { /* BulletConfig, 4.2 */ }
}
```

`localTime = time - startDelaySec`。以降の式はすべて `localTime` を使う。

### 4.1 EmitterConfig（発射設定）

| フィールド | 型 | 意味 |
|---|---|---|
| `count` | int ≥ 1 | 同時発射数。1ショットあたりのリング上の弾数。 |
| `interval` | number > 0 (秒) | 発射間隔。 |
| `direction` | Vec3 | 基準発射方向（正規化して使用）。 |
| `spreadAngleDeg` | number 0–360 | 拡散角度（円錐の頂角）。半角 = `spreadAngleDeg / 2`。 |
| `rotationAxis` | Vec3 | 各弾を円錐上に配置した**後**に、その向きを回転させる軸（正規化）。`direction` と同じ軸を指定した場合（既定値）は、弾のリング全体がその場でスピンする「回転連射（カーブショット）」になる。`direction` と異なる軸を指定すると、円錐全体がその軸の周りで首振り（歳差運動）する。詳細と数式の同値性の証明は5.3節。 |
| `rotationSpeedDeg` | number | `rotationAxis` 周りの回転速度（度/秒）。 |
| `waveAmplitudeDeg` | number ≥ 0 | 追加の波打ちチルトの振幅（度）。0で無効。 |
| `waveFrequencyHz` | number ≥ 0 | 波打ちの周波数（Hz）。 |
| `waveAxis` | Vec3 | 波打ちチルトの回転軸（`rotationAxis` とは独立）。 |
| `position` | Vec3 | 発射原点（ワールド座標）。 |
| `emissionDuration` | number ≥ 0 (秒) | このレイヤーが新規ショットを発射し続ける時間。 |
| `azimuthJitterDeg` | number ≥ 0 | 各弾の方位角へのランダムばらつき幅（度）。 |
| `spreadJitterDeg` | number ≥ 0 | 各弾の円錐半角へのランダムばらつき幅（度）。 |

### 4.2 BulletConfig（弾の設定）

| フィールド | 型 | 意味 |
|---|---|---|
| `shape` | `"sphere"\|"box"\|"octahedron"\|"sprite"` | 弾の形状（レンダラ側の見た目のみに影響）。 |
| `size` | number > 0 | 大きさ（半径相当、シーン単位）。 |
| `color` | hex string | 発射直後の色。 |
| `colorEnd` | hex string | 寿命終了時点の色。`age/lifetime` で線形補間。 |
| `speed` | number | 初速（単位/秒）。 |
| `speedJitter` | number 0–1 | 初速へのランダムばらつき（±割合）。 |
| `acceleration` | number | 進行方向への加速度（単位/秒²）。 |
| `lifetime` | number > 0 (秒) | 発射後の寿命。 |
| `glowIntensity` | number ≥ 0 | 発光強度（Bloomでの光り方の強さ）。 |
| `trail` | `"none"\|"line"` | 軌跡の有無。 |
| `trailDurationSec` | number ≥ 0 | 軌跡として表示する過去何秒分の軌道か。 |
| `spawnAnim` | `"none"\|"fade"\|"scale"\|"fadeScale"` | 出現・消滅演出の種類。 |
| `spawnAnimFrac` | number 0–0.5 | 寿命に対する出現アニメーションの割合。 |
| `despawnAnimFrac` | number 0–0.5 | 寿命に対する消滅アニメーションの割合。 |

---

## 5. 計算アルゴリズム（正の実装）

以下は `rotatingBarrage.ts` を言語非依存の擬似コードに書き下したもの。
Python実装はこの通りの計算順序・式を再現すること。

### 5.1 ベクトル演算

```
normalize(v) = v / |v|                       (|v| < 1e-9 のとき [0,0,1] を返す)

rotateAroundAxis(v, axis, angleDeg):           # ロドリゲスの回転公式
    k = normalize(axis)
    θ = radians(angleDeg)
    return v*cos(θ) + cross(k, v)*sin(θ) + k*dot(k, v)*(1 - cos(θ))

coneDirection(dir, halfAngleDeg, azimuthDeg):
    d = normalize(dir)
    worldUp = (0, 1, 0)
    referenceUp = (1, 0, 0) if |dot(d, worldUp)| > 0.999 else worldUp   # 特異点回避
    u = normalize(cross(referenceUp, d))
    v = cross(d, u)                            # d, u は正規直交なので v も単位ベクトル
    half = radians(halfAngleDeg)
    az   = radians(azimuthDeg)
    radial = u*cos(az) + v*sin(az)
    return normalize(d*cos(half) + radial*sin(half))

kinematicPosition(origin, dir, speed, accel, age):
    dist = speed*age + 0.5*accel*age^2
    return origin + dir*dist
```

### 5.2 乱数（決定論的ハッシュ）

状態を持たない純粋関数。`(seed, a, b, c, salt)` の組から `[0, 1)` の値を
一意に求める。評価順序に依存しないため、タイムラインの任意の時刻に
瞬時にジャンプしても常に同じ結果になる。

すべての演算は **32bit符号付き整数のラップアラウンド演算**
（JavaScriptの `Math.imul` / ビット演算と同一のセマンティクス）で行う。

```
定数:
  MAGIC = 0x9e3779b9
  MUL_A = 0x85ebca6b
  MUL_B = 0xc2b2ae35
  MUL_C = 0x27d4eb2f

imul32(a, b)   := 32bit符号付き整数として a*b を計算し、下位32bitでラップ
                  （Python: `to_int32((a * b) & 0xFFFFFFFF)`）
to_int32(x)    := x を下位32bitでラップし、2の補数として符号付き解釈
to_uint32(x)   := x を下位32bitでラップした非負整数（0..2^32-1）

hashToUnit(seed, a, b, c, salt):
    h = to_int32(seed XOR MAGIC)
    h = imul32(h XOR a, MUL_A)
    h = imul32(h XOR b, MUL_B)
    h = imul32(h XOR c, MUL_C)
    h = imul32(h XOR salt, MUL_A XOR MUL_C)
    h = to_int32(h XOR (to_uint32(h) >> 15))     # >> は論理右シフト（uint32として）
    h = to_uint32(h)
    return h / 4294967296.0                       # [0, 1)

hashToSigned(seed, a, b, c, salt) = hashToUnit(...) * 2 - 1     # [-1, 1)
```

ソルト定数（`RandomSalt`）: `AZIMUTH = 1`, `SPREAD = 2`, `SPEED = 3`。

**文字列ハッシュ**（レイヤーIDを整数キーへ変換）:

```
stringHash(s):
    h = 0
    for ch in s:                      # UTF-16コードユニット単位
        h = to_int32(h*31 + codeOf(ch))
    return h
```

JSONの `layers[i].id` は、インポート時もこの文字列を変更せず保持すること。
変更すると、同じ `seed` でも乱数列（＝弾のばらつき方）が変わってしまう。

### 5.3 1レイヤー・1時刻のシミュレーション

```
layerKey = stringHash(layer.id)
localT   = time - layer.startDelaySec

# このlocalTで「生存している可能性がある」ショット番号の範囲を求める
# （全ショットを0から走査しない。計算量をlifetime/interval程度に抑えるため）
sMax = floor( min(localT, emitter.emissionDuration) / emitter.interval )
sMin = max( 0, ceil( (localT - bullet.lifetime) / emitter.interval ) )

for s in sMin..sMax:
    shotTime = layer.startDelaySec + s * emitter.interval
    age = time - shotTime
    if age < 0 or age > bullet.lifetime: continue      # まだ発射前 or 寿命切れ

    baseDir   = normalize(emitter.direction)
    waveAngle = emitter.waveAmplitudeDeg
                * sin(2*PI * emitter.waveFrequencyHz * shotTime)
    tiltedDir = rotateAroundAxis(baseDir, emitter.waveAxis, waveAngle)

    for b in 0..emitter.count-1:
        baseAzimuth  = (360 / emitter.count) * b
        jitterAz     = hashToSigned(seed, layerKey, s, b, SALT_AZIMUTH) * emitter.azimuthJitterDeg
        jitterSpread = hashToSigned(seed, layerKey, s, b, SALT_SPREAD)  * emitter.spreadJitterDeg
        halfAngle    = max(0, emitter.spreadAngleDeg/2 + jitterSpread)
        azimuth      = baseAzimuth + jitterAz
        coneDir      = coneDirection(tiltedDir, halfAngle, azimuth)

        # 円錐上に配置した「後」に rotationAxis 周りへ回転させる。これが
        # 5.3.1節で証明する通り、rotationAxis == tiltedDir（典型的には
        # rotationAxis == direction）のとき「azimuth に
        # rotationSpeedDeg*shotTime を足す」のと完全に同値になる。
        dir          = rotateAroundAxis(coneDir, emitter.rotationAxis,
                                         emitter.rotationSpeedDeg * shotTime)

        speedJitter  = hashToSigned(seed, layerKey, s, b, SALT_SPEED) * bullet.speedJitter
        speed        = bullet.speed * (1 + speedJitter)

        position = kinematicPosition(emitter.position, dir, speed, bullet.acceleration, age)
        color    = lerpColor(bullet.color, bullet.colorEnd, clamp(age/bullet.lifetime, 0, 1))
        (opacity, scale) = animEnvelope(age, bullet.lifetime,
                                         bullet.spawnAnimFrac, bullet.despawnAnimFrac,
                                         bullet.spawnAnim)
        # => この (position, dir, color, opacity, scale, bullet.glowIntensity) が
        #    1個の弾の、時刻 time における完全な状態。
```

#### 5.3.1 `rotationAxis` が `tiltedDir` と一致する場合の同値性

上記で「円錐上に配置した後に `rotationAxis` 周りで回転させる」という順序を
採用しているのには理由がある。もし代わりに「`direction` 自体を
`rotationAxis` 周りで回転させてから円錐上に配置する」実装にすると、
**`rotationAxis` が `direction` と平行なとき、回転は見た目上まったく効果が
ない**（軸と平行なベクトルをその軸周りに回転させても変化しないため）。
典型的な「その場でリングが回転する」設定（`rotationAxis == direction`、
既定値はまさにこれ）がちょうどこの退化ケースに当たってしまう。

本仕様（円錐配置 → 回転の順）ではこの問題が起きない。証明:

`tiltedDir` を `d`、円錐配置で使う正規直交基底を `(u, v, d)`（`coneDirection`
が内部で構築するもの）とすると、配置後の方向は

```
coneDir = d*cos(half) + (u*cos(az) + v*sin(az))*sin(half)
```

`rotationAxis = d` のとき、`rotateAroundAxis(coneDir, d, θ)` は `d` 成分
（`cos(half)*d`）を変化させず、`(u, v)` 平面内の成分だけを
`θ` 回転させる。`(u, v, d)` は右手系の正規直交基底なので、この回転は
ちょうど

```
u*cos(az) + v*sin(az)  →  u*cos(az+θ) + v*sin(az+θ)
```

という変換になる（2次元回転と同じ代数）。つまり

```
rotateAroundAxis(coneDir, d, θ) == coneDirection(d, half, az + θ)
```

が厳密に成り立つ。`θ = rotationSpeedDeg * shotTime` なので、
**`rotationAxis == tiltedDir` のとき、本アルゴリズムは「`azimuth` に
`rotationSpeedDeg * shotTime` を足すだけ」と完全に同値** — すなわち
軸がどの向きであっても回転が必ず効果を持つ。一方 `rotationAxis` が
`tiltedDir` と異なる場合は、配置後の方向ベクトルをその軸周りに回転させる
ことになり、円錐全体が歳差運動のように首振りする（多層立体弾幕プリセット
の層Bなどで利用）。どちらの場合も自然で連続的な動きになり、特殊なケース
分けは不要。

`animEnvelope` は出現・消滅演出（`spawnAnim`）に応じて `opacity` と `scale`
（ともに初期値1）を次のように減衰させる:

```
spawnDur   = lifetime * clamp(spawnAnimFrac, 0, 0.5)
despawnDur = lifetime * clamp(despawnAnimFrac, 0, 0.5)

if mode != "none" and spawnDur > 0 and age < spawnDur:
    f = clamp(age / spawnDur, 0, 1)
    if mode in ("fade", "fadeScale"):  opacity *= f
    if mode in ("scale", "fadeScale"): scale   *= f

if mode != "none" and despawnDur > 0 and age > lifetime - despawnDur:
    f = clamp((lifetime - age) / despawnDur, 0, 1)
    if mode in ("fade", "fadeScale"):  opacity *= f
    if mode in ("scale", "fadeScale"): scale   *= f
```

### 5.4 軌跡（トレイル）

`bullet.trail == "line"` かつ `bullet.trailDurationSec > 0` の弾について、
過去の軌道を8点サンプリングして折れ線として描画する。各点は同じ
`kinematicPosition` 式を異なる `age` で評価するだけなので、履歴バッファを
保持する必要がない（＝どの時刻にシークしても同じ結果になる）。

```
TRAIL_SAMPLES = 8
span = min(age, bullet.trailDurationSec)
for i in 0..TRAIL_SAMPLES-1:
    f = i / (TRAIL_SAMPLES - 1)              # 0=最も古い, 1=現在
    sampleAge = age - span * (1 - f)
    point[i]  = kinematicPosition(emitter.position, dir, speed, bullet.acceleration, sampleAge)
```

### 5.5 発射時の光（マズルフラッシュ）

`stage.muzzleFlash.enabled` が true のとき、各ショットについて
`age = time - shotTime` が `[0, muzzleFlash.durationSec]` の範囲にある間、
`emitter.position` にフラッシュを表示する。
`progress = age / durationSec`（`durationSec = 0` のときは常に `progress = 1`）。

---

## 6. 再現性についての注意・検証データ

### 6.1 再現性の保証範囲

- 同じ `EffectDocument`（JSON全体）と同じ `time` を入力すれば、本仕様に従う
  限り実装言語やレンダラが変わっても同じ `(position, direction, color,
  opacity, scale)` の集合が得られる。
- シミュレーション（5章）とレンダリング（Three.jsの描画コード）は意図的に
  分離されている。Blender側はレンダリングをBlenderのメッシュ・マテリアル・
  キーフレームで行い、シミュレーション部分だけをこの仕様通りに再実装すれば
  よい。
- 浮動小数点演算の丸め誤差により、言語間で完全なビット一致はしない場合が
  あるが、見た目上の差は生じない程度に収束する。

### 6.2 手計算で検証できる最小例（回転サニティチェック）

5.3.1節の同値性を疑わずに信じる必要はない。以下は `count=1`（1ショット1発）
・ジッターなし・`rotationAxis == direction` という最小構成での、手計算可能な
具体例である。実データは `web/test/golden/rotation-sanity.json` に
（この設定の `EffectDocument` 全体と、複数時刻での計算結果として）保存され
ている。Blender側の実装者は、同じ `doc` を自分の実装に読み込ませて
同じ `time` で評価し、以下の値と一致するかどうかで実装を検証できる。

設定（抜粋）:

```
direction        = (0, 1, 0)
rotationAxis     = (0, 1, 0)   # directionと同じ軸（かつてバグで無効化されていたケース）
rotationSpeedDeg = 90
spreadAngleDeg   = 60          # halfAngle = 30°
count            = 1           # bulletIndex = 0, baseAzimuth = 0, ジッターなし
interval         = 1.0
```

`direction = (0,1,0)` はワールドアップと平行なので、`coneDirection` は
特異点回避のため `referenceUp = (1,0,0)` を使う（2.1節／5.1節参照）。これにより
正規直交基底は `u=(0,0,1)`, `v=(1,0,0)`, `d=(0,1,0)` となり、
`halfAngle=30°, azimuth=0°` の円錐上の点は

```
coneDir = d*cos(30°) + u*sin(30°) = (0, 0.8660, 0.5)
```

（`u*cos(0)+v*sin(0) = u` なので、半径成分は `u` そのもの）。

ショット `s` の発射時刻は `shotTime = s * 1.0 = s` 秒なので、
`rotationAxis=(0,1,0)` 周りに `90° * s` 回転させると:

| shotIndex `s` | 回転角 | `direction`（最終的な弾の進行方向） |
|---|---|---|
| 0 | 0° | `(0, 0.8660, 0.5)` |
| 1 | 90° | `(0.5, 0.8660, 0)` |
| 2 | 180° | `(0, 0.8660, -0.5)` |
| 3 | 270° | `(-0.5, 0.8660, 0)` |
| 4 | 360°（= 0°と同じ） | `(0, 0.8660, 0.5)`（s=0と一致、周期性の確認） |

`web/test/golden/rotation-sanity.json` の `time=4` のサンプルには
`shotIndex` 0〜4 の弾がすべて（寿命10秒のため）生存しており、実際に
この表の通りの `direction` が記録されている
（`web/test/simulation.test.ts` が自動検証）。

### 6.3 ゴールデンフィクスチャ（自動テスト・Blender側検証データ）

`web/test/golden/*.json` に、5つのプリセットそれぞれ＋上記の回転
サニティチェック用の、入力 `doc` と複数時刻での期待出力 `samples` を
セットにした「正解データ」を同梱している。

- 生成コマンド: `npm run gen:golden`（`web/scripts/genGolden.ts`）。
  計算アルゴリズム（5章）を意図的に変更した場合は、このコマンドを再実行して
  フィクスチャを更新し、**この仕様書の5章も合わせて更新すること**。
- ファイルサイズを抑えるため、`samples[].frame` 内の数値はすべて小数点
  以下6桁に丸め、各弾の軌跡（`trails[].points`）は8点のうち最初と最後の
  点だけを残している（`bullets` の `position`/`direction` は丸め以外の
  加工なし）。自動テストはこの丸め・間引きを踏まえた許容誤差（1e-5）で比較
  している。
- 自動テスト: `npm test`（`web/test/simulation.test.ts`）が、各フィクス
  チャの `doc` を実際に `computeEffectFrame` へ再入力し、保存済みの
  `samples` と数値的に一致する（許容誤差 1e-9）ことを検証する。これにより
  計算アルゴリズムの意図しない回帰（例: 今回発見された回転バグの再発）を
  検出する。
- Blender側の実装者は、各フィクスチャの `doc` をそのままPython実装に読み込
  ませ、同じ `samples[].time` で評価した結果を突き合わせることで、移植が
  正しいかどうかを独立に検証できる。

## 7. 既知の制約・今回のスコープ外

- 乱数はすべて `Math.imul` 相当の32bit整数演算に依存しているため、Python側
  実装では `numpy.int32` 等で明示的に32bitへラップする必要がある（素朴に
  Python標準の多倍長intで計算すると異なる結果になる）。
- `effectType` は現状 `"rotating_barrage"` のみ。将来追加される種別
  （雷・斬撃・爆発・魔法陣など）は、この5章と同じ形式で別ファイルとして
  仕様化する想定（`web/src/core/effects/registry.ts` の拡張ポイントに対応）。
- シミュレーション（5章）は弾数に上限を設けていないが、**描画側
  （Three.jsレンダラ）には1形状あたり弾6000個・軌跡2500本・マズルフラッシュ
  128個という描画上限がある**（`web/src/render/Particles.ts` の
  `RENDER_CAPACITY`）。発射間隔を極端に短くする、寿命を極端に長くするなど
  してこの上限を超えると、計算上は存在するが画面には描画されない弾が生じる。
  その場合はプレビュー画面上部に警告バナーが表示され、計算上の個数と実際に
  描画された個数が明示される。JSONの書き出し内容自体には影響しない
  （書き出されるのはあくまで5章のアルゴリズムで計算される設定値であり、
  描画上限とは独立）。
- JSON読み込み時は、数値の範囲・列挙値・ベクトルの要素数・色コード形式・
  レイヤーIDの重複などを検証し、不正な値は妥当な既定値へ自動調整したうえで
  警告メッセージを表示する（`web/src/io/sanitize.ts`）。検証範囲（最小値・
  最大値）は `web/src/core/limits.ts` に一元化されており、設定パネルの
  スライダーの可動域と常に一致する。
