# 直接评估强类型文档与按需生成最终 Core 读取树

2026-09-14，改动前基线 `1728beb`。

## 完成内容

V3/V4 原先把最终强类型文档序列化成完整 JSON 缓冲，再解析成对象树，
供 Core 规则和插件读取使用。现在：

- Foundation 提供只读借用游标，直接读取强类型 DTO 的字段、数组和标量。
  使用已有的语义/功能规则，不另写一套校验规则。字段映射与已有 DTO 编解码
  声明共用宏，避免字段新增时两份定义漂移。
- 通过不保留输出的计数写入器检查原有字节上限，通过借用遍历检查原有
  深度和属性数上限。仍执行这些检查；没有把资源保护换成无条件成功。
- 最终插件回调先使用元数据与扩展上下文。需要 Core 对象时，才生成完整
  读取树，同次评估的 validate/classify 共享它。原有身份索引、候选版本、
  单回调及整次操作读取预算、宿主/Wasm 预算仍然执行。
- 旧宿主协议继续原来的完整捕获路径；V4 detached migration 未在本轮改动。

这一步减少的是临时完整 JSON 缓冲与解析树。最终强类型文档投影、字节计数、
属性计数、语义与功能规则仍可能遍历全篇；请求 Core 对象仍有完整读取树和
索引构造成本。**尚未实现完整增量评估。**

## 验证与覆盖范围

- 使用原有冻结/生成语料中能转换成强类型 DTO 的 **443 个案例**，直接比较
  借用评估与独立 TS 语义/功能结果，包括诊断内容、顺序、路径及自定义配置。
  原始 632 个案例中，其余案例不能表示为该 DTO；旧的 raw-candidate
  测试继续覆盖它们，没有删除或修改冻结语料。
- 单独验证 lossless UTF-16、负零、缺失字段、嵌套扩展字段、数组与
  optional 读取。字节上限检查覆盖恰好可用与少一个字节；全局深度与属性
  上限覆盖临界值及其后继，并与旧 JSON 编解码路径比较。
- Rust 集成回归保留插件验证/分类、错误优先级、读取预算、迁移、历史
  和 4,096/4,097 诊断边界。
- 真实 Native/Wasm 测试证明：普通参考编辑少生成一个完整 Core 读取树；
  强制 validate/classify 请求音符时，只额外生成一次，两阶段都读到当前
  修改后的音高，后续撤销/重做与 SDK 结果一致。新断言在旧 addon 上失败，
  在新产物上通过。
- 最终全 workspace / all-features Rust：**585 通过、1 忽略、0 失败**。
- 最终完整 Node/Native：**892 总计、890 通过、2 跳过、0 失败**。
- TS 构建、严格类型检查、Rust fmt、全目标全功能严格 Clippy、
  Rust 1.88 全目标全功能检查通过。

本轮重建 Wasm addon；其他 Integrated/Core addon 未替换，相关回归沿用
原产物。本轮生产代码的 Native 运行证据来自重建的 Wasm addon。

## 新旧产物对比

Windows x64 / Node 24.15.0，同机、原样代表性文档（25,600 事件）。
构建和测试结束后顺序运行，每轮新进程、一个会话，先做一次排除的编辑，
再测六次公开插件编辑。不是正式资格测试，不生成 p95/p99。

| 轮次 | 旧中位数 | 新中位数 |
| --- | ---: | ---: |
| 1 | 477.28 ms | 291.38 ms |
| 2 | 441.59 ms | 293.57 ms |
| 3 | 442.18 ms | 314.75 ms |

三轮均下降，约 **29%–39%**。新进程峰值 RSS 约 517–518 MB，
旧产物约 483–555 MB；没有一致的峰值内存降低证据。该指标包括初始化、
夹具和保留历史，不是单次编辑分配量。

六轮原始结果：
`docs/evidence/borrowed-assessment-comparison-2026-09-14.json`。

## 冻结负载前置检查

| 负载 | 初始化 | 编辑 | 撤销 | 重做 | 缓存读取 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 代表性 | 897.54 ms | 322.98 ms | 311.44 ms | 315.14 ms | 0.19 ms |
| 压力 | 3,687.33 ms，成功 | 985.35 ms，诊断超限拒绝 | 未执行 | 未执行 | 未计时 |

此处每项仅一个样本。代表性修改、撤销、重做的数据检查通过，仍因原始编码
哈希差异导致前置检查失败。压力编辑仍因旧 K1 功能报告超出诊断上限而拒绝。
两份报告都是退出码 1、`qualification: false`，没有降低冻结性能目标。

- `docs/evidence/borrowed-assessment-representative-2026-09-14.json`
- `docs/evidence/borrowed-assessment-stress-2026-09-14.json`

## 产物与复现

新 `target/wasm-v1/brilliant_kernel_node.node`：6,054,912 字节，
SHA-256 `6dd588ab5b691007170a1edc7b8ed88fa04eaec47255f30122e4f2117995d161`。
旧备份 `target/borrowed-assessment/prior-wasm-v1.node`：
`3977e868b6785fabda84bb7df1c08e3d70ecabc7096b92316dddffb0644a44f4`。
guest 产物未改动。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node scripts/build.mjs
node --test dist/test/core-kernel/rust-migration/wasm-core-reads.test.js
node scripts/profile-native-cvn7-editing.mjs target/borrowed-assessment/prior-wasm-v1.node
node scripts/profile-native-cvn7-editing.mjs target/wasm-v1/brilliant_kernel_node.node
node scripts/probe-native-qualification-v4.mjs representative
node scripts/probe-native-qualification-v4.mjs stress
```

替换产物、构建、测试与测量按序执行。测试日志位于
`target/borrowed-assessment/`。

## 剩余商业缺口

本轮取得了可重复的参考负载改善，但 291–315 ms 的编辑中位数仍不能满足
代表性负载 p95 <= 8 ms 的目标。后续必须继续减少全量校验/投影、解决压力
编辑报告策略与编码兼容、完成正式长序列与性能资格、真实插件/UI 集成，
最后再做默认引擎切换与发布审查。没有提高商业完成度百分比。
