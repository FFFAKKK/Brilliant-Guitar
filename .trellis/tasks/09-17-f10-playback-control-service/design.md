# F10 技术设计

## 边界

权威数据仍由 Core `ScoreDocument` 提供。播放运行状态不进入 Core、乐谱文件或撤销历史。

```text
Core snapshot
  -> PlaybackSourceProjection（浏览器宿主 / Rust 宿主）
  -> PlaybackPlanProjector（工作台应用层）
  -> PlaybackSession
  -> PlaybackEngine port
  -> WebAudioPlaybackEngine
  -> Playback UI Projection / Command Router
  -> Transport Control + Staff Playback Head
```

## 播放源投影

`ScoreSessionRead` 增加与 `notation` 并列的版本化 `playbackSource`。它只包含第一版可执行播放所需的事实：

- `documentId`、`documentVersion`、`bpm`；
- 单个 part 的 `writtenToSounding`；
- 依文档小节顺序排列的 measure、meter、voice start 与事件；
- 事件 ID、精确时值、休止或书写音高。

浏览器 `apps/workbench/host` 和桌面 `apps/desktop/src-tauri` 必须从同一次 Core read 生成该投影。验证器拒绝版本不一致、重复 ID、非法分数和第一版不支持的结构。`NotationView` 保持纯显示合同。

## 播放计划

应用层把播放源编译为不可变 `PlaybackPlan`：

- 所有时间使用约分后的精确分数；
- 每小节跨度为 `max(nominalDuration, actualDuration)`；
- sounding pitch 通过权威书写音高和 part 移调计算，再映射为 MIDI；
- 休止事件保留时间但不产生发声项目；
- 每个计划带文档 ID、版本、BPM 和总时长。

投影失败返回结构化、稳定的计划诊断，不回退到 UI 猜测。

## 播放会话

`PlaybackSession` 是工作台框架服务，维护 `unavailable | stopped | playing | paused`，以及语义位置、起点、计划版本和会话序号。公开异步 `play/pause/stop/seek`，通过订阅提供快照。

每次重播、停止、计划替换或失败都会递增会话序号并取消旧调度。文档 ID 或版本改变时立即停止并替换计划。

## 执行端

`PlaybackEngine` 接口只负责激活、调度、暂停、继续、停止和时钟读取。Web Audio 实现由用户手势首次激活，使用振荡器与包络完成第一版真实发声；所有节点在停止时断开。

后续音源与 MIDI 接入继续实现这个端口，由工作台播放输出注册表选择当前后端：

- 内置合成器：零配置默认后端；
- 采样器／SoundFont：读取用户选择的本地音源资源并在音频后端内映射 program、pitch 和 velocity；
- MIDI Out：把播放计划转成带时间戳的 Note On／Note Off，发送到用户选择的外部 MIDI 输出端口。

MIDI Out 是事件输出，不等同于音色资源。后端选择、音源资源 ID、MIDI 端口 ID 和乐器映射属于应用配置，不写入临时播放会话；乐谱仅保存有音乐意义的乐器／音色意图，不保存机器相关设备句柄。UI 插件只读取输出后端 Projection 并执行切换命令，不直接访问 Web Audio、Web MIDI 或本地文件。

建议的稳定合同为：

```ts
type PlaybackOutputKind = "builtin-synth" | "sample-bank" | "midi-out";

interface PlaybackOutputDescriptor {
  readonly id: string;
  readonly kind: PlaybackOutputKind;
  readonly label: string;
  readonly available: boolean;
  readonly diagnosticCode: string | null;
}

interface PlaybackOutputRegistry {
  list(): readonly PlaybackOutputDescriptor[];
  activeId(): string;
  select(id: string): Promise<void>;
  createEngine(): PlaybackEngine;
}
```

切换输出后端时必须先停止当前会话、取消旧调度、激活新后端，再用同一 `PlaybackSourceProjection` 重建可播放状态。失败保留原后端并返回结构化诊断，不允许出现半切换状态。

浏览器自动播放限制映射为 `audio.activation-required`，设备或上下文失败使用独立诊断，不使用网络错误。

## UI 插件

新增 `PLAYBACK_PROJECTION`、`playback.previous`、`playback.toggle`、`playback.next`、`playback.stop` 和 `playback.transport` 组件。组件只消费投影并执行命令，不拥有 `AudioContext`、计时器或计划。上一／下一事件使用播放计划中的真实事件边界，不从谱面几何推断。

顶部共享停靠区使用居中 inline zone。播放／暂停是主动作，停止和事件跳转是次动作。组件通过统一布局服务支持上、下、左、右共享停靠区，保留稳定 ID、权限声明和布局持久化。时间位置是只读状态，在极窄空间可以隐藏，位置入口必须保留。

Staff 投影增加只读播放头状态。播放头由现有事件／锚点几何定位，但使用独立 SVG 图层、颜色 token 和 CSS 类；高频位置更新避免触发 VexFlow 重绘。

## 兼容与回滚

- 布局配置升级时补入新组件，不移动用户已有组件。
- `playbackSource` 是宿主 DTO 新字段，浏览器与 Rust 必须同批更新，避免桌面端被前端验证器拒绝。
- 每个切片保持独立测试；若 Web Audio 或 UI 切片未通过，可保留已经验证的投影与计划层而不装配控件。
