# SPEC-011 国际化与语言资源

## 状态

- 状态: 草案
- 映射需求: `REQ-012`
- 目标: 固定语言切换、翻译资源、i18n key、fallback 和可本地化元数据契约。

## 支持语言

第一阶段必须支持:

- `zh-CN`: 简体中文。
- `en-US`: 英文。

其它语言后置。

## Locale 契约

```ts
export type Locale = "zh-CN" | "en-US"

export interface LocalizedText {
  key: string
  fallback: string
}

export interface LocalizedLabel {
  zhCN: string
  enUS: string
}

export type LocaleSource = "saved-preference" | "system" | "fallback" | "test-override"
```

## 强制规则

- I18N-001: 用户可见字符串不得硬编码在 React 组件、命令定义或错误对象中。
- I18N-002: 每个用户可见字符串必须通过稳定 i18n key 引用。
- I18N-003: 技巧类型、命令 ID、插件 ID、文件 schema 字段不得随语言变化。
- I18N-004: 技巧必须同时拥有稳定枚举、中文名称和英文术语。
- I18N-005: 缺失当前语言翻译时必须回退到 `en-US`。
- I18N-006: 用户语言偏好必须持久化。
- I18N-007: 导入导出报告必须使用 i18n key 和参数生成用户可见消息。
- I18N-008: 插件 manifest 的标题和描述必须支持本地化字段或 i18n key。
- I18N-009: 默认语言解析顺序必须为 `savedPreference -> supportedSystemLocale -> en-US`。
- I18N-010: 自动化测试、导出 smoke test 和截图验证必须能显式覆盖 locale。

## Key 命名规则

推荐 key 格式:

```text
menu.file.open
menu.file.save
command.score.new
command.playback.play
technique.bend.name
technique.bend.description
error.fret.outOfRange
import.musicxml.unsupportedTechnique
```

规则:

- key 使用小写英文和点号分组。
- key 不得包含用户数据。
- key 重命名必须视为破坏性变更，除非有迁移或兼容映射。

## 技巧本地化契约

```ts
export interface TechniqueLocalization {
  type: GuitarTechniqueType
  category: TechniqueCategory
  name: Record<Locale, string>
  term: string
  description?: Record<Locale, string>
}
```

示例:

```json
{
  "type": "bend",
  "category": "pitch_expression",
  "name": {
    "zh-CN": "推弦",
    "en-US": "Bend"
  },
  "term": "bend"
}
```

## UI 行为

- 中文界面推荐显示中文名，英文术语作为括号或 tooltip。
- 英文界面显示英文名。
- 设置中必须能切换语言。
- 切换语言不应改变谱面文档数据。
- 首次启动没有保存偏好时，中文系统默认 `zh-CN`，其它系统默认 `en-US`。
- 用户保存语言偏好后，该偏好优先于系统语言。

## Locale 解析

```ts
export interface LocaleResolution {
  locale: Locale
  source: LocaleSource
}
```

规则:

- 如果存在有效保存偏好，使用该偏好并标记 `saved-preference`。
- 如果无保存偏好且系统语言是中文环境，使用 `zh-CN` 并标记 `system`。
- 如果无保存偏好且系统语言不是中文环境，使用 `en-US` 并标记 `system`。
- 如果系统语言无法读取或不受支持，使用 `en-US` 并标记 `fallback`。
- 测试可注入 locale override，并标记 `test-override`。

## 测试要求

- [ ] AC-SPEC-011-01: 中文和英文语言包都能加载。
- [ ] AC-SPEC-011-02: 切换语言后菜单、命令面板、技巧选择器和错误提示更新。
- [ ] AC-SPEC-011-03: 文档模型中的技巧枚举不随语言切换变化。
- [ ] AC-SPEC-011-04: 缺失 `zh-CN` 翻译时回退到 `en-US`。
- [ ] AC-SPEC-011-05: i18n 扫描能发现未声明 key 或未使用 key。
- [ ] AC-SPEC-011-06: locale 解析覆盖保存偏好、中文系统、非中文系统、无法读取系统语言和测试 override。
