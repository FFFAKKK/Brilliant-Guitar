# Candidate 可见节点读取优化

日期：2026-09-16。

## 问题

Candidate 的最终文档投影和完整 Core 语义验证都从根节点按顺序遍历可见实体。
旧实现虽然已经从一个可见父节点取得了子节点，读取子节点字段时仍会再次沿
`Document -> Part -> Content -> Voice -> Event -> Note` 逐级验证祖先可见性。
代表性 25,600 事件混合 Batch 因此产生 1,454,434 次 owner 索引查询；这些
查询不增加新的语义证明。

## 实现

- `visit_order` 先证明 owner 可见。对于 owner 与当前 order 一致的子节点，
  只检查该节点的 tombstone；Part/Measure 内容链接还检查实际 link 状态。
- 如果遇到 owner 不一致的异常结构，仍回退到原来的完整祖先遍历，保持失败
  行为和诊断边界。
- 最终文档投影和 Foundation Candidate assessment 对已经由可见 order 返回的
  节点使用可见读取入口，避免每个字段再次证明同一祖先链。
- 原有字段读取、语义规则、诊断顺序、容量控制、提交计划、历史和公开协议均
  未改变。普通命令定位和可变 Candidate 操作仍使用完整可见性检查。

## 验证

- Rust workspace all-features：608 通过、1 忽略、0 失败。
- 完整 Node/Native/Wasm：894 通过、2 项按设计门控跳过、0 失败。
- `cargo fmt --check`、严格 Clippy、Rust 1.88 MSRV 全目标检查通过。
- Candidate assessment、SDK integrated view、异常结构、资源失败、undo/redo、
  跨插件读取和 Wasm 压力路径均包含在上述完整回归中。

## 性能证据

使用未修改的 `scripts/profile-native-paged-batch.mjs`，在相同机器上交替运行
旧 addon（`97e00a3`）与当前 addon，每个变体三个全新进程：

| 轮次 | 旧版本 submit-batch | 当前版本 submit-batch |
| --- | ---: | ---: |
| 1 | 760.57 ms | 622.67 ms |
| 2 | 768.46 ms | 562.56 ms |
| 3 | 794.79 ms | 597.49 ms |
| 中位数 | 768.46 ms | 597.49 ms |

提交中位数下降 **22.25%**。同一操作的 owner 查询从 1,454,434 降至
336,954，下降 **76.83%**；实体访问量保持 443,558，三轮状态、提交、undo
哈希和 redo 哈希检查全部通过。峰值 RSS 没有形成稳定改善，本轮不宣称内存
收益。

原始对照数据保存在
`docs/evidence/candidate-visible-read-comparison-2026-09-16.json`。这些是诊断
样本，不是商业 p95/p99 资格结果。代表性混合 Batch 仍约 0.6 秒，后续应继续
缩小完整 Candidate 语义扫描的依赖闭包，并通过真实业务插件和桌面交互预算
决定是否需要更深的增量化。
