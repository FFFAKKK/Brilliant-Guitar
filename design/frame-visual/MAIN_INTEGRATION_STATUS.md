# 主线整合状态

更新：2026-10-20。C4 精确源闭包已通过下述组合验收。

## 从同一源码启动

首次检出时，先按顺序准备锁定依赖和本地运行时包：

```powershell
npm ci
npm --prefix packages/agent-runtime ci
npm --prefix packages/agent-runtime run build
npm --prefix apps/workbench ci
npm --prefix apps/desktop ci
npm --prefix design/frame-visual ci
npm --prefix apps/workbench run agent:build
```

之后使用原入口：

```powershell
# 浏览器预览：明确使用 fixture，不连接真实桌面作品
npm --prefix design/frame-visual run serve

# 原生备份入口：独立应用身份，复用正式 Rust 文档服务
npm run desktop:backup:dev
```

普通预览打开服务提供的 `runtime-preview.html`。不要把旧 EXE 或历史截图当成当前源码的结果。
共享 Tab 绘制的独立回归入口为 `notation-regression.html?notation=tablature`。

运行备份整包测试时，容量用例还需要原 Node 内核 addon 和 Workbench 的独立 TS 内核输出：

```powershell
npm run build
npm --prefix apps/workbench run kernel:build
node design/frame-visual/scripts/build-desktop.mjs
npm --prefix design/frame-visual run notation:capacity-build
npm --prefix design/frame-visual test
```

## 本次保留什么

- 正式 PluginPlatform、4.0 mount、唯一文档/选择/输入/历史和 guarded 文件链。
- 五线谱的基础输入、范围/剪贴板、属性、小节/拍号、调号、谱号及作品信息控件。
- 同一宿主视口的阅读宽度适配和滚动保位；旧 `fit()` 仍适应整页，新控件显式选择谱宽。
- 四栏原生命周期和权限，连续侧栏裁切、上下栏真实组件单次挂载、局部焦点露出。
- 共享 Tab 绘制的数字墨迹居中、休止、下行节奏和系统宽度分配。
  可选宽度分配不改变五线谱原来的自然宽度；数字继续使用调用者已加载的字体。

## 哪些工作尚未完成

当前产品 view 仍为五线谱。Tab 只读切换方案保留在原视觉工作树，不能覆盖已经接好的编辑控件；
Tab 实际界面/数字输入、新建吉他、空拍插入和关系清理继续由原功能任务推进。

## 本次组合验收

- 独立导出候选的备份整包 1007 项通过；谱号工具修复后，83 项相关回归通过。
- 同版浏览器 Tab 回归 1872/1872 通过，并核对实际 Bravura/Academico 字形、
  数字居中、休止和下方节奏。框架开合保持谱页位置；显式适应谱宽使用当前可用宽度。
- 隔离原生应用完成新建、A4 输入、撤销/重做、受保护保存、退出及从最近作品重开；
  仅操作任务专用测试文件。修复了谱号预览继承 VexFlow 临时尺寸造成的工具栏溢出，
  重建后在同一原生入口确认尺寸正常、已保存内容仍可重开。

以上使用现有依赖和 Node addon，限定为本次整合验收；设备、IME、发布资格等
仍沿各功能任务的既有边界推进。

## 回归 fixture 和历史证据

正式测试与容量构建依赖的少量历史源和数据必须随源码保留：
runtime-composition、sidebar-integration、style-boundaries、tablature-rendering，
以及 document-capacity 的四组作品/投影和报告。
这些是测试输入，不是当前通过证据。

生成器对源文件原始字节做一致性检查。`.gitattributes` 为相关文本固定 LF，
避免 Windows 自动换行使重新检出的源码与生成资源产生虚假的过期差异。

其余数千份历史截图和审计现场另行保全。历史文档中的 `evidence/` 链接及本地
`.trellis/` 工作流链接不保证在源码检出中存在；日常启动和正式测试不依赖完整历史审计包。
