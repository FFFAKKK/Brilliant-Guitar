# SPEC-015 内核注册表与 Capability 重规划门

> **状态：BLOCKED / NOT EXECUTABLE。** K1-4 等待 K1-2/K1-3 公共契约稳定后重规划。旧 contribution 清单不再有效。

## 1. Scope / Trigger

当两个以上模块需要通过稳定身份贡献命令、selector、validator、migration 或外部格式 descriptor，且直接静态组合不足以满足边界时触发。

## 2. Signatures

最终 Registry、ModuleIdentity、Capability、StartupManifest 与 ContributionKind 尚未批准。不得从旧文件复制类型。

## 3. Contracts

- `ExtensionBlock` 是持久化纯数据，不是 registry contribution 或插件实例。
- `ScoreFeatureProfile` 是产品支持策略，不是权限 capability。
- contribution 必须由真实跨模块协作需求证明，不能为未来插件平台预建空泛类型。
- origin、runtime、trust 与 capability 独立；官方来源不自动获得全部权限。
- V1 若保留 registry，只允许启动期静态 builtin/internal-module 组合，不执行第三方代码。
- 注册权限与执行权限分离，summary 不泄漏 handler 或可变文档。
- 吉他技巧是否需要注册表由 Guitar Domain 和 K1-4 共同证明；不得默认恢复旧 Core 技巧定义。

## 4. Validation & Error Matrix

重复 ID、未知 kind、API version 不兼容、unsupported runtime、capability denied 和启动后动态变更必须有稳定行为；具体 code 在 K1-4/K1-5 联合评审后批准。

## 5. Good / Base / Bad Cases

- Good：已批准的 command/selector contribution 在启动期注册并通过 capability 执行。
- Base：应用内静态组合若已足够，则 K1-4 可以缩减 registry，而不是为数量目标增加抽象。
- Bad：把 ExtensionBlock namespace 当成可执行插件，或注册旧测试技巧只为证明 registry 存在。

## 6. Tests Required

正式 K1-4 必须覆盖 contribution 必要性、重复/版本/runtime/capability 拒绝、静态启动边界、summary 隐私和无第三方执行依赖。

## 7. Wrong vs Correct

```typescript
// Wrong
registry.execute(extensionBlock.payload)

// Correct direction
const payload = domainDecoder.decode(extensionBlock)
registry.executeApprovedContribution(contributionId, authorizedInput)
```
