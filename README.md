# Brilliant Guitar

吉他制谱项目的内核仓库。`master` 已整合通过回归的 Rust 内核：基础编辑、统一事务/历史、插件执行/迁移、受限 WASM 和跨插件显式读取，可用于开发集成。商业资源、平台和性能资格尚未完成。

**后续内核开发以 Rust 为主。旧 TS 事务引擎已冻结归档，不再作为独立功能开发线。** TS SDK、数据合同、共享校验服务和 Node 适配仍是现有 Rust 集成链路的一部分。旧默认入口仍会运行 TS；新集成请显式选择下面的 Rust 入口。此次 Git 整合未完成默认切换。详见 [TS 归档边界](docs/archive/typescript-kernel.md)。

## 当前入口

- [2026-09-13 项目状态与产品设计交接](docs/handoff-kernel-to-product-2026-09-13.md)：最新业务验证、UI／吉他插件设计入口及尚未完成事项。
- `src/`：TypeScript 内核、SDK 和原生适配。
- `src/native-host/`：宿主专用的 WASM 产物安装；Node 依赖不进入纯内核。
- `crates/`：七个 Rust crate，依次承担基础类型、乐谱规则、扩展协议、边界合同、运行时、会话与 Node 桥。
- `test/`：行为回归、TS/Rust 差分、原生入口和历史资格检查。
- `docs/kernel-commercial-completion.md`：功能进度及验证记录。
- `docs/kernel-extension-completion-plan.md`：尚未完成的扩展与组合会话计划。
- `.trellis/spec/`：工程约定；任务和日志目录保留历史，不代表当前全部待办。

## 使用当前 Rust 内核

构建下述原生产物后，宿主使用 `src/core-kernel/native/integrated-command-bus.ts` 的 `installNativeIntegratedBackendV2(addon)`，在选择期间调用 `CommandBus.createIntegrated(document, catalog)`。选择函数返回 restore；恢复选择不会改变已创建的 Rust session。该路径的文档、事务和历史由 Rust 持有。

需要 WASM 时，使用 `src/native-host/wasm-bindings.ts` 的 `installNativeWasmIntegratedBackendV1(addon, catalog, bindings)`，绑定真实 catalog 和经过哈希校验的产物。需要跨插件读取时，使用 [显式读取合同](docs/kernel-contribution-reads-v1.md) 的派生 catalog。普通 `CommandBus.create()` 仍是旧 TS 兼容入口，不能据此判断 Rust 已启用。

## 构建与验证

使用 Node 24 与 `package-lock.json` 安装依赖；Rust 工具链由 `rust-toolchain.toml` 固定，MSRV 是 Rust 1.88。

```powershell
npm ci
npm run typecheck
npm run build
cargo test --workspace --locked --offline
cargo build -p brilliant-kernel-node --release --locked --offline
New-Item -ItemType Directory -Force target/rkp-1-node | Out-Null
Copy-Item target/release/brilliant_kernel_node.dll target/rkp-1-node/brilliant_kernel_node.node
cargo build -p brilliant-kernel-node --release --features integrated-bridge-v2 --locked --offline
New-Item -ItemType Directory -Force target/integrated-v2 | Out-Null
Copy-Item target/release/brilliant_kernel_node.dll target/integrated-v2/brilliant_kernel_node.node
cargo build -p brilliant-kernel-node --release --features wasm-bridge-v1 --locked --offline
New-Item -ItemType Directory -Force target/wasm-v1 | Out-Null
Copy-Item target/release/brilliant_kernel_node.dll target/wasm-v1/brilliant_kernel_node.node
npm test
```

以上原生产物复制命令针对 Windows；首次安装 Rust 依赖时需要联网运行 Cargo，之后才可使用 `--offline`。`npm test` 包含原生测试，必须先构建匹配当前源码的 addon。不要在测试运行时覆盖 addon 或清理构建目录。

三个 addon 分别保留：`rkp-1-node` 是冻结的五入口 Core V1 产物，`integrated-v2` 是增加私有组合会话和独立扩展迁移入口的七入口实验产物，`wasm-v1` 再增加受限 WASM 编译执行入口。按上面的顺序分别构建、复制，不能互相覆盖。V2 已接通真实 SDK 插件命令、独立 Core 编辑、跨域 Batch 和显式扩展迁移；WASM 支持宿主显式绑定到真实贡献者，仍未完成商业资格或产品默认切换。见 [当前插件 Native 闭环](docs/kernel-native-integrated-v2.md) 和 [WASM 执行与绑定](docs/kernel-wasm-executor-v1.md)。

`npm run build` 会先清理本工作区的 `dist`，防止已删除源码留下旧 JS；不要与同工作区的测试并行执行。普通静态检查使用 `npm run typecheck`，无需重建输出。

## 工作区与本地文件

根目录 `master` 已包含内核分支截至 `f9ec44b` 的全部 26 项新提交；内核工作区保留为后续开发入口，UI 工作区独立保留。历史版本通过 `archive/2026-09-12/*` 标签恢复。本次只整合已提交成果、冻结 TS 开发线并清理两条失效 worktree 登记，没有删除实际开发目录。主线更新不改变默认后端，也不代表商业资格通过。

`target/`、`dist/`、`node_modules/` 是本地生成目录。历史上 `target/` 混有验证日志，清理前必须先保存必要证据。`tmp/` 包含本地参考资料，不应当成可重建缓存自动清空。`.repo-archive/` 保存本次整理的恢复包，不提交 Git，也不要作为缓存删除。

整理记录与恢复方法见 [仓库维护记录](docs/repository-maintenance.md)。

开发分支的 `.local-evidence/` 保存后续检查日志，与编译缓存分开；它不提交 Git，也不应随缓存清理。需要长期保存的证据应再打包备份，并在进度文档记录对应提交和产物标识。
