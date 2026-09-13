# Wasm guest 读取与容量进展 · 2026-09-13

本轮部分解决了上一轮发现的容量问题：同一真实 Native、同一完整文档输入和
相同资源上限下，测试 guest 的 64 小节插件编辑从六次全部拒绝变为六次全部成功。
256 小节仍在 `commandPrepare` 耗尽燃料，**尚未解决大文档容量问题**。
这里的容量只适用于本次测试插件与负载，不代表任意插件或正式吉他产品插件。

## 修改与合同

`brilliant-extension-protocol` 新增可选 `scoped-guest-v1` 功能，提供私有 V1
回调数据的 Rust 解码工具。它没有执行器、Store、写权限或插件实例。
默认功能仍为空，七个宿主 crate 的依赖方向不变；`serde_json` 复用已有锁定版本，
仅这个可选功能开启 `raw_value`。工作区合同测试精确登记了这一个功能和依赖，
仍拒绝其他功能、额外 crate、依赖方向变化和公开导出漂移。

- 请求的六类回调按各自参数形状流式解码，校验版本、必填字段、重复字段和参数个数。
  当前宿主先写 operation，再写 arguments，因此常规路径只扫描一次。
  arguments 提前出现的合法 JSON 仍支持，通过借用原文后再解码实现，可能多一次扫描。
- 默认 Core 类型是借用的完整 JSON 原文，保留数字拼写和转义字符。
  guest 也可选择泛型 Core 类型，在第一次扫描时只构造所需字段的 Rust 对象。
  这是 guest 的解析选择；宿主输入仍包含完整 Core 文档，V1 字段没有删减。
- 动态回调参数、兼容扩展和显式依赖读取使用普通 JSON visitor，
  保留 `$serde_json::private::RawValue` 同名用户键及负零，避免解析库内部标记
  改变业务数据。原有 legacy 数值构造器会归一化负零，因此没有复用或修改它。
- 默认借用 Core 可用 `read_core<T>()` 按类型读取；需要动态值时用
  `read_core_value()` 保留普通键语义。调用者自行选择的第三方反序列化类型仍受其
  自身语义约束。已解析字符串仍是 Rust scalar Unicode；这不是完整 UTF-16 guest codec。

测试 guest 使用共享工具，并只为需要的分部／小节建立借用索引；需要读取音符时
再解析对应小节。新增测试实际读取第 64 小节最后一个音符，修改它后读取到新音高。
原有 score／part 编辑、显式跨插件读取、校验、分类、迁移行为仍由原有回归比较。
该 guest 是可复现参考实现，不是正式业务插件。

## 测量证据

两个新进程使用同一版 `scripts/profile-native-integrated.mjs`，只替换 guest。
16、64、256 小节均为一个分部、每小节四个音符，每种规模尝试六次插件编辑。
旧 guest 来自 `828ba76`，原字节另存于本地证据目录；新 guest 在当前提交中。

| 小节／音符 | 旧 guest 成功次数 | 新 guest 成功次数 | 新 guest 编辑中位数 |
|---|---:|---:|---:|
| 16／64 | 6/6 | 6/6 | 20.18 ms |
| 64／256 | 0/6 | 6/6 | 53.48 ms |
| 256／1024 | 0/6 | 0/6 | 不计为成功编辑耗时 |

16 小节的成功编辑中位数从 32.18 ms 降至 20.18 ms，六次编辑的 guest 时间总和
从 126.32 ms 降至 54.66 ms；输入加输出仍同为 341,313 字节。
64 小节旧结果是拒绝，不能拿其拒绝耗时与新成功耗时比较“加速比”。
256 小节在独立重放同一输入时仍报 `wasm.execution-failed:FuelExhausted`，
输入 211,794 字节；新 guest 无法消除完整文档扫描的规模成本。

没有调整单次 10,000,000 fuel、操作累计 100,000,000 fuel／4096 次调用／128 MiB
传输上限，也没有修改冻结的 CVN-7 测量合同。以上为 Windows x64、Node 24.15.0、
i9-13900HX 的有限诊断样本，不是容量上限搜索、P95/P99、峰值内存或商业性能资格。
本轮没有替换任何宿主 `.node`；使用上一轮已验证的 Wasm Native 产物。

## 复现

```powershell
node scripts/build.mjs
node test/core-kernel/fixtures/wasm-guest/build.mjs
node --expose-gc scripts/profile-native-integrated.mjs
node --expose-gc scripts/profile-native-integrated.mjs --guest .local-evidence/wasm-guest-capacity-2026-09-13/before-guest.wasm
cargo +1.97.1 test -p brilliant-extension-protocol --features scoped-guest-v1 --locked --offline
```

guest 重建要求 PATH 中有 Cargo、安装了 Rust 1.88.0 与 wasm32-unknown-unknown。
旧 guest 的二进制 SHA-256 是
`922b0ca4c33db0c11a8526433a0b197ebbf7ff0188416bd9ef22cece116df703`；
新克隆若没有本地证据目录，可从 `828ba76:test/core-kernel/fixtures/wasm-guest/guest.wasm`
导出原始二进制字节后使用 `--guest`。不要用会转码的文本读取／写入流程导出 Wasm。
源码、guest Cargo.lock、共享工具和 guest.wasm 必须一起保留。

## 当前结论与下一步

后续独立版本 V2 已接通真实 Wasm 按需读取参考路径，256 小节编辑 6/6 成功，
见[新容量报告](kernel-wasm-selective-guest-2026-09-13.md)。本报告的 V1 完整
视图失败记录仍然成立，不应覆盖成旧协议自然支持 256 小节。

后续切片已完成 Rust 候选按需读取基础 R1，见
[读取合同与阶段边界](kernel-scoped-core-reads-v2.md)。它尚未接到 Node/Wasm；
新宿主产物上的 256 小节准备仍耗尽燃料，因此本报告的容量缺口保持未解决。

微内核基础功能仍粗估 85–90%，商业准备仍约 65%；这不是剩余工期比例。
本轮验证扩大了参考 guest 的可用范围，但核心容量缺口还在，因此不提高商业评价。

下一步应处理版本化的按需读取／受限 ScoreSlice 输入合同，使常见局部编辑不会
反复扫描整份文档；现有 V1 完整视图必须保留兼容路径，不能静默删字段或自动提高
燃料限制。验收需要覆盖 256 小节成功编辑、实际 Core 读取、跨插件候选态可见性、
旧插件兼容与同一事务资源记账。Rust 所有的完整插件调度、长期资源稳定性、
目标平台资格和发布流程仍未完成。

测试、构件身份与证据目录见 [验证记录](evidence/kernel-wasm-guest-capacity-2026-09-13.json)。
