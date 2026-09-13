# Rust 最终校验投影复用 · 2026-09-13

最终校验原先先把强类型候选完整编码、解析为无损 JSON 供 Core 校验，随后又做
同样的转换供插件回调或按需读取使用。现在只构造一次，以所有权移动交给下一阶段。
Core 语义、支持度、插件名单、权限、诊断和最终采用规则均保留，不跨事务缓存候选。
旧聚合回调和 V3/V4 调度路径都复用这份已经检查过的数据。

另将 Integrated wire 的字段读取、精确字段集合检查接到已有
`with_json_field_key`：短 ASCII 字段名使用栈上 UTF-16 片段查询，无需每次
分配 `JsString`。非 ASCII、长字段名保持既有回退；已有基础层测试覆盖空串、
控制字符、Unicode、长键和孤立代理项排序/查找边界。

## 参考测量

同机 Windows x64 / Node 24.15.0 / i9-13900HX，固定 V2 guest 和显式 V4。
旧、新 Native 分别测量三轮，顺序为旧/新、旧/新、新/旧；测量期间没有构建或
测试并行。以下为 256 小节各轮中位数的最小到最大范围：

| 操作 | 优化前 | 优化后 |
|---|---:|---:|
| 基础元数据编辑，每轮 6 次 | 29.55–30.24 ms | 22.77–24.39 ms |
| 插件编辑，每轮 6 次 | 60.34–64.88 ms | 54.57–59.46 ms |
| 撤销再重做，每轮 3 对 | 60.72–62.31 ms | 49.35–52.01 ms |

16/64/256 小节均无编辑失败；六次插件编辑的宿主请求仍是 26,145 B。
收益来自内部工作减少，没有通过减少数据传输或放宽预算取得。小文档及单次
创建耗时有噪声，不声明普遍提速比例。进程内存快照不能证明峰值或无泄漏；
本次仍是参考诊断，不是商业性能资格。

## 验证与复现

- Rust 全工作区全功能 **577 通过、1 忽略、0 失败**。
- Node/Native **888 项，886 通过、2 跳过、0 失败**，包含真实 V2/V3/V4
  编辑、历史、候选读取、独立迁移、拒绝及资源失败回滚测试。
- 严格 Clippy、fmt、Rust 1.88 全目标全功能检查通过。
  本轮 TS 源码未变，使用上一轮已构建的 TS 执行本轮新 Native。
- 本轮没有新增外部行为；使用现有语义/无损数据回归和旧、新产物对照验证优化，
  未引入按机器耗时决定成败的测试门槛。

代码基线 `c4d2cbf`。新 `target/wasm-v1/brilliant_kernel_node.node` 为
5,871,104 字节，SHA-256：
`e700a1377bd37bfe134bbaec33eee804d1f706be3f03988feaff76047f9f96f2`。
前代保存在 `target/assessment-projection-reuse/prior-wasm-v1.node`，
SHA-256 `7b77131b79d94cbc0dad19ae885d42ac7aa7eb73aa1ce42d5ada2a08ebaf2abb`。
其他 Integrated/Core addon 未替换；相关测试沿用原产物。本轮 Native 执行
证据来自重建后的 Wasm addon。

```powershell
cargo +1.97.1 build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
node --expose-gc scripts/profile-native-integrated.mjs --scheduled-editing-v4
cargo +1.97.1 test --workspace --all-features --locked --offline
node dist/test/test-infrastructure/run-compiled-tests.js
```

需要先有匹配源码的 TS 构建；替换 addon、构建、剖析和测试应顺序进行。
本地 `target/assessment-projection-reuse/` 保留六轮 JSON 和验证日志。

剩余开销包括准备/变换的完整候选投影、强类型数据到 JSON 的往返、读取索引构建
和完整最终校验。下一步应推进直接借用候选的读取来源，并证明临时 Batch 状态、
读权限和资源边界不变。V4 尚未默认切换，真实产品闭环、目标平台、稳定性和
发布资格仍待完成；基础功能粗估 85–90%，商业准备约 65%，不因参考提速提高评级。
