# F10 基础播放控制与真实播放服务方案

日期：2026-09-17。

状态：第一版已实现并通过浏览器、Workbench 与 Rust 应用层验证；待前端链路完成后统一进行 Tauri 图形界面集成验收。

本文展开 [第一版前端交付清单](frontend-v1-delivery-checklist.md) 中的 F10。播放不是一组三个静态按钮，而是一条从内核乐谱快照到时间线、音频时钟、播放会话、命令和谱面播放头的真实链路。

## 一、实施前现状审计

项目当前只有 `components/transport-contract.ts` 中未使用的 `TransportSnapshot` 与 `TransportCommands` 草案。它尚未接入：

- 乐谱到播放时间线的投影；
- 音频时钟与真实发声引擎；
- 可订阅的播放会话；
- UI Plugin Projection、命令和组件；
- `Space` 播放／暂停快捷键；
- 与 F09 覆盖层独立的播放头；
- 音频初始化失败、设备中断和文档变化时的恢复策略。

2026-09-17 进一步核对发现：权威 Core 文档已经包含 `metadata.tempo.bpm`、
`instrument.writtenToSounding` 和书写音高，但当前原子 `ScoreSessionRead` 只保留标题、
版本、历史与 `NotationView`。`NotationView` 又只服务五线谱显示，使用书写音高，不能安全地
承担播放输入。因此 F10 不能从 VexFlow DOM、谱面几何或当前 `NotationView` 反推 BPM、
移调与实际发声音高。

`package.json` 中也没有第三方合成器、采样器或 MIDI 播放依赖。因此 F10 必须先完成最小真实播放服务，再装配控件。

## 二、成熟软件提供的共同规则

- Guitar Pro 8 把传输控制放在顶部工具栏，编辑光标与播放滚动分别管理；播放时点击谱面可以改变后续起点，手动滚动会暂停自动跟随。
- MuseScore Studio 使用顶部播放工具栏，`Space` 切换播放／暂停；播放起点可以来自选择或上次停止位置；循环、节拍器、速度和计数器属于同一播放领域，但不必全部常驻第一层。
- Guitar Pro 8 允许选择播放光标的运动方式，并把当前小节强调作为可关闭选项，说明播放头是独立显示策略，不应复用编辑光标。

第一版采用共同的高频交集：可停靠的紧凑传输控制、`Space`、真实播放状态、独立播放头。停止、上一事件、播放／暂停、下一事件和紧凑时间位置直接可用；循环、节拍器、试听速度和声音设置留在后续展开层。

## 三、分层位置

```text
Rust Core / ScoreDocument
  ↓ 只读快照、精确时值、绝对／移调音高数据
PlaybackPlanProjector（应用层）
  ↓ 可执行的语义时间线
PlaybackEngine（可替换执行端）
  ↓ 时钟、发声、取消
PlaybackSession（工作台框架服务）
  ↓ 快照与命令
UI Plugin Projection / Command Router
  ↓
Transport Control + Score Playback Head
```

- Core 继续负责乐谱事实、时值和音高，不保存“正在播放”这种临时运行状态。
- `PlaybackPlanProjector` 从权威文档快照生成播放计划，不从 VexFlow DOM 或视觉 `NotationView` 反推音乐数据。
- 浏览器 TypeScript 宿主与 Tauri/Rust 宿主必须从同一次 Core 快照生成独立的
  `PlaybackSourceProjection`，并带上 `documentId` 与 `documentVersion`。它与
  `NotationView` 并列，不把播放字段塞进五线谱显示合同。
- `PlaybackSession` 属于工作台应用服务，生命周期跟随当前工作区；它不进入文档撤销历史，也不写入乐谱文件。
- `PlaybackEngine` 是可替换端口。第一版使用 Web Audio，因此浏览器验证与 Tauri WebView 都能真实发声；未来可以替换为原生 Rust 音频插件而不改 UI 插件合同。
- 播放输出后端在 `PlaybackEngine` 端口后注册。内置合成器是零配置默认项；采样器／SoundFont 后端负责从本地音源资源发声；MIDI Out 后端负责向外部设备或虚拟端口发送 MIDI 事件。三者使用同一播放计划与会话状态机。
- 后端选择、音源资源 ID、MIDI 输出端口 ID 和本机乐器映射属于应用配置；乐谱只保存乐器与音色的音乐意图，不保存本机路径或设备句柄。
- UI 插件只读取 Projection、执行 Command，不直接持有 `AudioContext` 或定时器。

## 四、第一版真实播放范围

第一版只承诺当前已经能可靠显示和编辑的内容：

- 单谱表、单声部；
- 单音与休止符；
- 常用基础时值与附点；
- 文档初始 BPM；
- 从乐谱开头、当前编辑位置或当前所选事件开始；
- 播放、暂停、继续、停止；
- 谱面播放头和最小自动跟随。

第一版暂不承诺和弦、多声部、连音线、反复、速度变化、力度、奏法、音色库、混音、循环、节拍器和导出音频。这些能力必须在播放计划合同中留出扩展位置，但不能用假按钮提前表现为可用。

## 五、播放计划

不要继续使用含义不明的数字 `position`。播放位置必须保持音乐语义：

```ts
interface PlaybackPosition {
  readonly measureId: string;
  readonly eventId: string | null;
  readonly offset: ExactFraction;
}

interface PlaybackEvent {
  readonly eventId: string;
  readonly start: ExactFraction;
  readonly duration: ExactFraction;
  readonly soundingMidi: number | null;
}

interface PlaybackPlan {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly bpm: number;
  readonly events: readonly PlaybackEvent[];
  readonly duration: ExactFraction;
}
```

- 使用精确分数编译节奏，只在提交给音频时钟时换算成秒。
- 发声使用 sounding pitch；界面仍显示 written pitch。移调关系来自乐谱文档，不由 UI 猜测。
- 不足拍小节在名义小节末尾前保留静音。
- 超拍小节允许试听：该小节按实际事件总时值延长，后续小节在 `max(名义时值, 实际时值)` 后开始，避免事件重叠；界面继续保留规则提示。
- 文档版本变化时停止当前播放并重新编译，不让旧计划继续播放已被修改的内容。

## 六、播放会话状态机

```text
unavailable ──设备可用──→ stopped
stopped ──play──→ playing
playing ──pause──→ paused
paused ──play──→ playing
playing/paused ──stop──→ stopped
任意可用状态 ──文档替换/计划失效──→ stopped
任意状态 ──引擎失败──→ unavailable
```

会话快照至少包含：

- `state`；
- 当前语义 `position`；
- 本次播放起点；
- 当前文档版本；
- `canPlay`、`canPause`、`canStop`；
- 结构化失败码，而不是模糊的“网络中断”。

`play()`、`pause()`、`stop()` 和 `seek()` 应为异步命令。所有定时回调带会话序号，停止、切换文档或重新播放后，旧回调不能再推动播放头。

## 七、第一版控件设计

### 视觉意图

- 使用者：正在连续打谱、频繁试听一小段内容的人。
- 任务：不用离开谱面就能开始、暂停和停止，并一眼判断当前是否在播放。
- 感觉：像乐谱桌上的紧凑传输键，安静、直接、可盲按。

### 布局

放在上方共享停靠区中部，利用历史控制与缩放之间的空位：

```text
[撤销 重做]       [停止 上一 播放/暂停 下一 位置]       [− 175% + 适配]
```

- 不显示“播放控制”等标题或说明文字。
- 播放／暂停是唯一主动作，图标稍强；停止和事件跳转为次动作。
- 可见图标保持紧凑，真实命中区不少于 40px；通过 `aria-label` 和 tooltip 提供名称与快捷键。
- `Space` 调用与按钮相同的 `playback.toggle` 命令；文本输入、菜单和对话框中不拦截空格。
- 引擎尚未完成初始化时不装配假按钮；用户首次点击或按 `Space` 时再按浏览器规则激活音频上下文。
- 第一层只加入具有真实服务的高频传输动作和紧凑时间位置；不把循环、节拍器、BPM 调节和音量以假功能塞入。
- 组件使用统一布局服务，可移动到上、下、左、右共享停靠区；极窄状态可隐藏时间，但保留位置入口。

### 窄窗口

- 保留播放／暂停、停止和可用的事件跳转图标，不压缩成不可点击的小点。
- 空间不足时历史和缩放先按现有共享停靠区规则收起；播放主动作保持可见。
- 更复杂的播放设置以后使用 popover，不扩大顶部栏高度。

## 八、播放头与编辑状态分离

- 播放头由 F09 的 `ScoreInteractionGeometry` 定位，但拥有独立状态和 DOM 层。
- 不复用蓝色编辑方框、选择框、影子符头、琥珀色规则提示或红色拒绝动画。
- 第一版采用一条克制的细播放线与小型顶部标记；颜色使用独立的低饱和雾蓝色播放语义 token，暂停时降低不透明度，不使用跳脱的荧光绿色。
- 位置更新走 `requestAnimationFrame` 或直接更新 SVG transform，不让 React 每帧重排整页谱面。
- 播放头离开视口安全区时做最小自动滚动；用户手动滚动后暂停自动跟随，但不暂停音频。
- 停止后隐藏播放头并恢复编辑状态；暂停时播放头停在当前语义位置。

## 九、失败与恢复

- 浏览器禁止自动播放不叫“网络中断”；它是 `audio.activation-required`，只能由用户手势恢复。
- 音频上下文创建失败、设备不可用和计划不支持使用不同的结构化诊断码。
- 失败由现有插件／工作台诊断系统记录；传输控件只显示紧凑的不可用状态和重试入口，不在顶部栏堆一行错误文字。
- 停止必须立即取消所有已调度声音，避免残音和重复音。
- 页面失焦、操作音符控制或开关停靠区不能让播放时钟假性暂停。

## 十、实施切片

### F10-A：播放计划与稳定合同

- 替换含义不明的数字位置合同。
- 定义版本化 `PlaybackSourceProjection`：BPM、乐器书写到发声的移调、按小节排列的单声部事件，以及对应的文档 ID／版本。
- 在浏览器宿主 `ScoreSessionService` 与 Rust 桌面宿主 `ScoreSessionService` 中从同一次 Core read 生成等价投影；这一改动属于宿主／应用 DTO，不修改 Core 文档或命令。
- 保持 `NotationView` 为纯显示投影，播放计划不读取 VexFlow DOM、谱面几何或 React 状态。
- 从 `ScoreDocument` 编译精确的单声部播放计划。
- 测试附点、休止、移调、不足拍、超拍和文档版本变化。

### F10-B：真实播放引擎与会话

- 实现可替换的 `PlaybackEngine` 接口。
- 第一版 Web Audio 引擎真实发声。
- 实现播放、暂停、继续、停止、取消旧调度和失败恢复。

### F10-C：插件投影、命令与顶部控件

- 注册 Playback Projection、`playback.previous`、`playback.toggle`、`playback.next` 与 `playback.stop`。
- 接入 `Space`，并验证输入控件和菜单不会误触发。
- 装配可停靠紧凑控制，补齐默认、播放、暂停、事件边界、禁用、失败和键盘焦点状态。

### F10-D：独立播放头与自动跟随

- 使用 F09 几何映射定位播放头。
- 验证缩放、停靠区显隐、跨页、手动滚动和动画关闭。
- 保证编辑光标、选择、悬停和播放头互不冒充。

### F10-E：播放输出后端与音源接入

- 建立 `PlaybackOutputRegistry`，统一注册内置合成器、采样音源／SoundFont 和 MIDI Out。
- 输出后端只消费现有 `PlaybackPlan`，不重新解释 Core 文档，也不从 UI 或 VexFlow 读取音高和时值。
- SoundFont／采样音源通过本地资源服务读取，使用稳定资源 ID；移动文件、资源缺失和格式不支持返回结构化诊断。
- MIDI Out 枚举和选择外部设备或虚拟端口，调度 Note On／Note Off；设备断开时立即停止相关输出并保留工作台编辑能力。
- 输出选择与设备映射保存在应用配置中；谱面文件不保存本机绝对路径、浏览器设备句柄或操作系统端口 ID。
- 输出选择界面作为播放领域的二级设置或独立音源组件，不挤入第一层高频传输按钮。

本次先完成 F10-E 的资源与界面基础：右侧可停靠“播放输出”组件以 `PlaybackOutputRegistry` 管理内置合成器和本地音源资源；它支持选择并校验 `.sf2`／`.sf3` 的扩展名、尺寸及 RIFF `sfbk` 文件头。导入后会以“已识别 · 待采样引擎”呈现，不能选择成实际播放输出，避免把资源识别伪装成已经可以采样播放。资源当前只存于工作台内存，乐谱文件不保存本机路径或文件句柄。

SoundFont 采样发声、SFZ 解析与 MIDI Out 仍是后续独立后端：它们接入 `PlaybackEngine` 端口和输出注册表，不改变播放计划、乐谱 Core 或 UI 插件合同。

## 十一、验收标准

- 实际扬声器能听到当前支持内容，不以计时动画冒充播放。
- 按钮和 `Space` 始终操作同一播放会话。
- 暂停后从当前位置继续；停止后没有残音或旧播放头回调。
- 当前编辑位置或选择可以成为播放起点。
- 文档修改、撤销、重做、打开新文件时不会继续播放旧快照。
- 超拍和不足拍都有确定且可测试的时间线行为。
- 播放期间操作其他组件、调整停靠区或窗口失焦不会假性停止。
- 播放头在缩放、滚动和重新排版后仍对应正确音乐位置。
- 控件在正常和窄窗口下都不损坏，不显示多余文字。
- 音频失败显示准确的本地诊断，不出现“网络中断”等错误描述。

## 十二、参考资料

- [Guitar Pro 8：Navigating a Score](https://www.guitar-pro.com/docs/gp8/basics/first-steps/navigate)
- [Guitar Pro 8：Playback and Tempo Control](https://www.guitar-pro.com/docs/gp8/audio/playback)
- [Guitar Pro 8：Interface Preferences](https://www.guitar-pro.com/docs/gp8/preferences-stylesheet/preferences/interface)
- [MuseScore Studio：Playback controls](https://handbook.musescore.org/sound-and-playback/playback-controls)

## 十三、实现与验证记录

2026-09-17 已完成：

- 浏览器与 Rust 宿主从同一次 Core 读取生成带文档 ID、版本、BPM、移调和精确事件时值的播放源；
- 精确分数播放计划覆盖单附点、休止、移调、不足拍、超拍、起点定位与不支持结构诊断；
- 可替换播放引擎、Web Audio 发声、播放／暂停／继续／停止、旧调度取消和文档版本失效；
- 共享停靠区中的紧凑停止、上一事件、播放／暂停、下一事件、时间位置和组件位置控件，以及与按钮共用命令的 `Space`；
- 与编辑光标分离的雾蓝色播放头、暂停状态、停止隐藏、缩放和重新排版后的几何重算；
- 常规和 420px 窄窗口布局；播放控件在历史与缩放收起时仍完整可用。
- 播放输出注册表、内置合成器默认后端和可停靠播放输出组件；本地 SF2／SF3 的格式校验与资源清单；输出切换时会停止旧引擎、取消旧时钟并回到可预测的停止状态。

验证结果：Workbench 161 项测试全部通过，生产构建通过；Rust `cargo` 在当前环境不可用，因此桌面端编译检查待拥有 Rust 工具链的环境执行。浏览器自动化连接暂时不可用，右侧输出组件的最终视觉回归待连接恢复后补做。既有 Vite 大分块提示来自 VexFlow 字体资源，不是 F10 回归。

桌面端图形界面暂不逐次启动。按照项目既定工作方式，在其余前端链路完成后统一接入验证。
