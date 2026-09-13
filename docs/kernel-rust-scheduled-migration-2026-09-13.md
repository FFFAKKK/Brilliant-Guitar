# Rust 调度独立迁移 · 2026-09-13

既有显式 `installNativeWasmScheduledEditingV4` 入口现在也由 Rust 调度独立迁移。
在此路径，Rust 决定效果解码、效果变换和最终插件校验的逐次调用，并检查和汇总
结果；TS 不再调用迁移准备和校验服务。没有新增产品级内核功能或切换默认入口。

## 合同

Native 迁移参数 `4` 启用新路径；省略参数和 `2` 保留旧行为，`3` 仍拒绝。
可信适配从已认证贡献者捕获声明读取，并以必填 `assessmentReads` 传入；
Rust 验证所有读取声明与装配的对应关系，不能借迁移增加插件读权限。

初始 Core 语义、装配、目标和版本检查保留既有先后次序。成功迁移和
`not-required` 都先完成 `migrationStart` 的 V4 确认及真实 Core 数据交互；
前置检查失败可以直接拒绝。降级到旧聚合回调、缺少确认却声称成功的宿主被拒绝。
之前的 V4 Native 尚不支持迁移参数 `4`，必须重建 addon 后使用此扩展能力。

迁移准备只接受合法解码及目标版本的替换结果，不接受删除、无变化或编辑专用
拒绝结果。旧块、兼容扩展和已授权依赖来自输入文档；最终校验看到替换后的候选。
所有回调均以 `documentVersion: null` 表明独立数据来源，没有伪造会话版本。
Core 读取直接借用 Rust 文档，不为每次回调额外复制整份 Core 候选。

最终插件校验按已安装装配的稳定顺序运行，只选择具有兼容自有扩展的贡献者。
与编辑的只读降级不同，迁移遇到被选中贡献者的未来版本依赖时必须拒绝。
诊断逐项检查来源和结构，每个贡献者最多 1024 条，累计最多 4096 条。
只执行迁移所需的语义校验，不增加支持度分类步骤。

宿主返回不能覆盖整个校验名单。回调失败、读取失败及额度耗尽不能被吞掉后
返回成功；后续独立操作恢复新的预算。原有 Wasm 和传输累计账户保持生效。
成功结果仍是独立文档，不采用到现有 Store，不改变已有版本、历史或事件。
重复迁移返回原输入；成功迁移保留既有 JSON 负零归一化规则。

## 实测与验证

同一 Windows x64 / Node 24.15.0 / i9-13900HX、同一新 release Native、
同一 V2 guest，顺序测量每档六次双插件参考文档迁移，均与 SDK 结果完全一致：

| 小节 | 回调请求 V2 → V4（六次合计） | 迁移中位耗时 V2 → V4 |
|---|---:|---:|
| 16 | 168,096 → 17,652 B | 18.26 → 14.48 ms |
| 64 | 641,304 → 17,652 B | 49.94 → 32.44 ms |
| 256 | 2,543,748 → 17,652 B | 190.64 → 112.70 ms |

这不包含 API 必需的完整输入/输出传输。256 小节 V4 六次的初始输入仍共
1,281,930 B，结果共 1,269,858 B。解码、Core 校验和候选构造仍随文档增长；
上述小样本不是 P95/P99、峰值内存、长期稳定性或真实业务性能资格。

- 27 项真实 Wasm 专项通过。新测试禁用 TS 迁移准备与校验函数，仍完成
  256 小节迁移及幂等返回；同时验证已有会话与事件不变、旧输入未被修改。
- V2/V4 对照包含无效效果、错误目标版本、语义问题、伪造结果/诊断、
  候选音符读取、兼容与不兼容依赖、后续恢复及过时宿主拒绝。
- Rust 3 项新增测试覆盖逐阶段旧/新视图、无会话版本的实际读取、幂等性、
  各阶段吞读取错误、错误握手/结果、单贡献者和跨贡献者诊断限额。
- Rust 全工作区全功能 **577 通过、1 忽略、0 失败**；
  Node/Native **888 项，886 通过、2 跳过、0 失败**。
  TS 构建、严格 Clippy、fmt 和 Rust 1.88 全目标全功能检查通过。
- 新真实迁移测试在上一代 addon 上返回拒绝而失败；重建后通过。

代码基线 `beaa4fe`。新 `target/wasm-v1/brilliant_kernel_node.node` 为
5,870,592 字节，SHA-256：
`7b77131b79d94cbc0dad19ae885d42ac7aa7eb73aa1ce42d5ada2a08ebaf2abb`。
前代备份位于 `target/scheduled-migration/prior-wasm-v1.node`，
SHA-256 `36fcabd41888e4d4b2318c4e5c36a8101b1710b7c829cab4d75c60a2649ce0fd`。
两代 guest 字节未改变；其他 Integrated/Core addon 未替换，相关全量测试沿用
原产物。本轮 Native 执行证据来自重新构建的 Wasm addon。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node scripts/build.mjs
node --test dist/test/core-kernel/rust-migration/wasm-core-reads.test.js
cargo +1.97.1 test --workspace --all-features --locked --offline
node dist/test/test-infrastructure/run-compiled-tests.js
node scripts/profile-native-migration.mjs
```

替换 addon、构建、测试及剖析应顺序执行。原始日志与测量 JSON 保留在本地
`target/scheduled-migration/`；脚本入库，日志可重建。

当前明确边界：V4 的编辑与独立迁移调度均由 Rust 控制，可信 Node 仍负责
真实 Wasm 绑定和数据往返。尚未默认切换，也未完成 Rust 直接执行客体、
候选投影成本优化、真实 UI/业务插件闭环及目标平台和发布验收。
基础功能粗估 85–90%，商业准备约 65%；这是定性判断，不是完成项比例。
下一轮以 Rust 候选构造及校验的实际成本证据为依据选择优化，不扩充业务功能。
