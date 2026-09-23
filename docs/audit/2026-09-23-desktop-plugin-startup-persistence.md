# Desktop 插件启动持久化阶段报告

日期：2026-09-23（Asia/Shanghai）

## 阶段结论

已修复并合并 Desktop 插件启动持久化问题。根因是 Desktop 启动路径绕过了
`bootstrapPersistedPluginPlatform`，直接调用 `PluginPlatform.start()`，因此没有创建
`PluginStartupController`，运行中调用插件启用设置时会得到
`Plugin activation storage is not connected`，重启也无法恢复用户选择。

修复已在独立 worktree 完成，并以非快进方式合并到 `main`：

- 修复分支：`codex/desktop-plugin-startup-persistence`
- 修复提交：`50e0d05 Persist desktop plugin startup configuration`
- 合并提交：`c34f30f Merge desktop plugin startup persistence`
- 合并前 `main`：`07e9d72`
- 当前 `main` 工作树：干净
- 未执行 push、rebase、amend 或修改远端

## 修复内容

1. Desktop 新增原子 JSON 文档存储：
   - 只接受 JSON 对象；
   - 限制单文件最大 256 KB；
   - 写入复用现有原子写入边界；
   - 损坏、超限或非对象文档隔离为 `.invalid-*` 后按缺失处理；
   - 增加 4 个 Rust 单元测试。
2. Tauri 新增四个版本化命令：
   - `workbench_read_plugin_activation_v1`
   - `workbench_write_plugin_activation_v1`
   - `workbench_read_plugin_settings_v1`
   - `workbench_write_plugin_settings_v1`
3. Workbench 新增 Tauri 插件启用配置和插件设置适配器，并与现有 Tauri 错误边界复用同一个调用辅助函数。
4. Browser 与 Desktop 统一经过 `bootstrapPersistedPluginPlatform`：
   - 先恢复启动意图；
   - 再启动并冻结插件会话；
   - 最后恢复插件设置；
   - Desktop 使用 Tauri 存储，Browser 继续使用浏览器存储。
5. 补充 Tauri 存储命令名称、payload 和启动行为回归测试。

## 验证

合并前修复 worktree：

```text
Workbench 聚焦测试：27/27 通过
Workbench 全量测试：624/624 通过
Workbench production typecheck：通过
Workbench test typecheck：通过
Rust desktop tests：70/70 通过
本轮触及 Rust 文件 rustfmt 检查：通过
git diff --check：通过
```

合并后 `main`：

```text
Workbench 全量测试：624/624 通过
Workbench production typecheck：通过
Workbench test typecheck：通过
Rust desktop tests：70/70 通过
```

仓库级 `cargo fmt --all -- --check` 仍会报告两个本阶段未修改的既有格式差异：

- `apps/desktop/src-tauri/src/application/tests.rs:31`
- `apps/desktop/src-tauri/src/settings.rs:463`

本阶段没有为了格式检查改动这两个无关文件。

## 边界与后续

本阶段只处理插件启用意图和插件设置的 Desktop 持久化接线，没有修改 Kernel 历史、
Plugin Resolver 身份规则、外部合同版本或数据文件 schema 版本。

`PluginStartupController` 已有的可选 recovery marker 接口仍未在当前 bootstrap 中启用；
崩溃恢复标记的 Desktop 持久化应作为单独阶段评估，不能把本阶段报告解读为已完成该功能。
