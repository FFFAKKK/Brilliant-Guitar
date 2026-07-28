# SPEC-015 内核注册表与 Capability

> **状态：K1-4 已验收并归档（2026-07-20）。** 验收基线为
> `94766a0930c05e5339c44f667deaf02116af1c0c`，125/125 测试通过。
> K1-5 实现基线 `51fa2177cbd25dea53f1ebaf23bd8b8426471589` 已于 2026-07-21 在文档基线 `ed801a9fa1a69222188c3ca04ee243b48d7a92d2` 通过独立验收，161/161 测试通过；K1-6 测试基线 `355512aba4a8057d2d75aa665d74df49cdd2e23c` 已在审查基线 `989c1f7a4056b14d3d59918c9b96874ad71591a8` 通过独立验收并关闭 Pure Core Kernel V1，且未扩大本 Registry 合同。

## 1. Scope / Trigger

K1-4 为随应用编译的官方 Core 模块提供启动期静态登记、贡献摘要和 capability-scoped gateway。首批只登记现有六个 command 和六个 K1-3 selector；贡献类型固定为 `command | selector`。

K1-4 不实现 validator、technique、migration、import/export、template、Guitar Domain、通用 report、第三方运行时或插件生命周期。`ExtensionBlock` 与 `ScoreFeatureProfile` 均不是权限或可执行贡献。

## 2. Signatures

公开合同由 `KernelModuleIdentity`、七个 `KernelCapability`、版本 1 的静态 manifest、`createKernelRegistry(unknown)`、只读 `KernelRegistry`、`KernelModuleGateway`、最小 `RegistrySummary`、六个稳定 selector request 以及封闭的 startup/access result union 组成。

模块身份维度独立：

- `origin = official | third-party`
- `runtime = builtin | internal-module | javascript-typescript`
- `trustLevel = system-trusted | sandboxed`
- `apiVersion = 1`

K1-4 只接受 manifest 绑定的 `official + builtin/internal-module + system-trusted`。

manifest 提供的 module/registration-entry ID 长度为 1–128，并匹配 `^[a-z0-9]+(?:[.-][a-z0-9]+)*$`；不安全 ID 返回 invalid startup input，格式安全但未编译的 entry 返回专用 not-found failure。

七个 capability 固定为：`registry:read`、`command:register`、`selector:register`、`command:execute`、`selector:execute`、`score:read`、`event:subscribe`。

## 3. Contracts

- Core Host 一次提交完整 manifest；严格解码与 compiled binding 在隔离 candidate 中完成，成功才返回已经冻结的 ready Registry，失败不返回半成品。
- strict decoder 只把 enumerable own `descriptor.value` 复制到脱离调用方的普通对象；验证后不得执行 Proxy 的普通 `get` trap，accessor 或失败的 Proxy 元操作必须安全拒绝。
- compiled registration entry 只有 `core.commands.v1` 与 `core.selectors.v1`，只绑定现有六个命令与六个 selector；不接受任意 handler 或新语义。
- capability 互不蕴含；登记、执行、读取、summary、订阅分别授权。startup/freeze 与 `markPersisted` 是 Host-only。
- Gateway 先解析 contribution 和 caller，再授权，最后委托现有 `CommandBus`、selector、read、subscribe。委托后的 `CommandResult`、`ReadResult` 与订阅行为原样透传。
- 现有 direct `CommandBus`/selector 保留为 trusted Core Host API；模块正常集成面是 gateway。
- ready Registry 无公开 builder/register/seal/unregister/replace，无 runtime mutation、`registryVersion` 或 `kernel.registry.changed`；K1-3 事件 union 不变。
- Summary 只含 manifest version、按 moduleId 排序的 moduleId/apiVersion，以及按 kind/id 排序的 contribution 公共元数据；深冻结、脱离内部状态，不泄露 grant、origin/runtime/trust、handler、index、Registry 或谱面。
- K1-4 Core-only 的 `moduleId` 不进入 command envelope、history、replay 或 K1-3 event；GD-2 integrated construction 只能按 GD-0 additive contract 在私有 history/catalog 中保留 contribution identity，并在 modular event/result 中公开 allowlisted namespaced identity，不改变 Core-only shape。
- K1-4 自有封闭、隐私安全的 startup/access failure；K1-5 只能映射，不能改名或改义。

## 4. Validation & Error Matrix

| 输入/操作 | 必须拒绝 | 结果 |
| --- | --- | --- |
| manifest | 额外/缺失字段、accessor、稀疏数组、无效有限值 | `registry.invalid-startup-input` |
| module | duplicate id、unsupported origin/runtime/trust、API mismatch | 对应 startup failure |
| binding/contribution | entry 不存在/owner 不匹配、duplicate id、capability 缺失、descriptor/handler 不匹配 | 对应 startup failure |
| gateway | 畸形调用、module/contribution 不存在、capability 缺失 | 对应 access failure |
| 任意意外异常 | startup/gateway 全边界 | `registry.internal-error`，所有既有状态不变 |

## 5. Good / Base / Bad Cases

- Good：获 `command:execute` 的模块通过 gateway 调用现有命令，并拿到完全相同的提交/no-op/rejected 结果。
- Good：获 `score:read + selector:execute` 的模块调用六个 selector；重复 summary 深度相等且冻结。
- Base：可信 Core Host 继续直接使用已验收 `CommandBus` 与 selector。
- Bad：只获 `command:register` 的模块执行命令，必须 capability denied。
- Bad：接收第三方脚本、任意 handler、动态 kind、局部 Registry 或运行期替换。

## 6. Tests Required

必须覆盖 strict decode、Proxy 零普通属性读取与稳定 descriptor 值、身份/版本/重复/capability/handler mismatch、原子 startup、冻结与确定排序、等价 manifest 重排后的 summary/gateway 行为、summary 隐私、六命令/六 selector parity、读写订阅权限矩阵、异常收口、失败零状态变化、history/replay/event 无 module attribution、公共导出和 forbidden dependency；最终执行 typecheck、build、完整测试、diff check 与 Trellis validation。

## 7. Wrong vs Correct

```typescript
// Wrong
registry.register(runtimePluginHandler)
eventBus.publish({ type: "kernel.registry.changed" })

// Correct
const created = createKernelRegistry(CORE_KERNEL_STARTUP_MANIFEST)
const gateway = created.ok
  ? created.registry.createGateway(moduleId, commandBus)
  : created
```

## 8. GD-0 Additive Official Domain Catalog

K1-4 Core-only Registry、六 command/六 selector adapter 与七个 capability 保持冻结。后续 GD-2 通过 integrated construction 增加独立审核的 `kernel.domain-commands.v1` compiled entry：

- manifest 仍为纯数据；compiled functions 由产品 composition root 静态链接并在 startup 与 manifest/descriptor 原子匹配。
- 仅接受 official、system-trusted、允许 runtime 的 contribution；不接收第三方脚本、路径、URL、dynamic import 或 manifest callback。
- catalog 必须验证 module/contribution/command/effect/namespace 唯一性、ID namespace ownership、capability、API/version、handler/descriptor parity、profile 与 compatibility declaration。
- ready catalog、descriptor、profile 与 compatibility data 深冻结；无 runtime register/unregister/replace、Registry version 或 changed event。
- integrated Registry、gateway、CommandBus 与 replay 绑定同一私有 assembly identity；cross-assembly 或 Core-only/integrated 错配在 construction 阶段稳定拒绝。
- `command:register` 仍不蕴含 `command:execute`；GD-0 不新增 generic document-mutation capability。
- Registry summary 继续只暴露 allowlisted metadata，不泄露 compiled handler、effect implementation、grants、mutable catalog 或文档。

此扩展只服务随应用发布的官方领域模块，不授权第三方 Extension Host 或插件生命周期实现。
