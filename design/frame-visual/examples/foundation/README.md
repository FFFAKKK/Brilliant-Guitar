# 公共包 4.0 的基础执行样例

日期：2026-10-07。这三份文件用于验证作者合同的执行性，不加入默认产品集合或管理页。
作者文件只导入公开的 `src/vendor/plugin-platform.js`；输入来自作者自己的数据源。
编写者已经审阅宿主，因此不能把这批样例自测记为独立作者盲测。
2026-10-08：[隔离目录作者指南](../../author-validation-guide-v4.md)把这些同源样例转换为仅依赖sdk.mjs的独立目录。维护者可验收独立提交而不把平台源码交给作者；生成样例通过仍只算参考自检。

| 文件 | 内容 | 作者自己的输入 |
| --- | --- | --- |
| panel-plugin.js | 左右栏面板、本插件设置读、命令执行、订阅及监听清理 | source.read()/subscribe()；可选onRun |
| command-plugin.js | 无组件命令包、view菜单、Mod+Alt+I映射；动态enabled及Promise结果 | enabled()/run(payload) |
| readonly-view-plugin.js | stage只读view、异步读/失败/重试、序号与协作取消 | read({signal})；不获得真实作品服务 |

从仓库根执行：

```text
npm --prefix design/frame-visual run startup:build
node --test --test-isolation=none design/frame-visual/tests/infrastructure-author-trials.test.js
```

SDK产物由正式TS生成。依赖已经由工程安装，样例不创建额外平台/router或修改SDK。
测试宿主负责装配现有平台、registry、router、菜单和组件宿主；作者只提交包。
按当前固定会话完成整个平台释放后才创建下一会话，没有单插件热插拔。

在现有备份应用装配A/B时，可信应用可以通过`createBackupUiRuntime({root, plugins:[panel, command]})`
传入已编译包。生产startupPlan仍使用应用已知目录，样例ID未加入该目录；若要由管理页配置它们，
应用必须先补齐已公开的目录元数据/字段与装配方案。不能往原计划追加未知ID，不能把独立测试说成目录自动扩展。

2026-10-08另有维护者样例[configured-plugin.js](configured-plugin.js)，演示count参数、命令和左右栏面板。
它通过`startupEntries:[{metadata,plugin}]`接入同一管理页与正式平台，完整步骤和字段见[固定装配合同](../../../../.trellis/spec/frontend/plugin-startup-assembly-contract.md)。
此样例不加入默认产品集合，也不改变七文件A/B/C作者包；配套`configurable-plugin-assembly.test.js`验证保存失败/重试、同会话保持及完整重建恢复，不把受控fake invoke称为实际磁盘重启。

C是独立工作区消费者，会占用唯一stage view。以下是单独试验页面的可信装配代码（路径以本目录为基准）：

```js
import { createReadonlyViewPlugin } from "./readonly-view-plugin.js";
import { createWorkspaceRuntime } from "../../src/host/workspace-runtime.js";
import { createBackupFormalPlatform, prepareBackupPlugin, configureBackupFormalPlatform }
  from "../../src/host/formal-plugin-assembly.js";

const root = document.getElementById("app");
const runtime = createWorkspaceRuntime({ root, requiredViewSlots: ["stage"],
  plugins: [createReadonlyViewPlugin({ read: async ({signal}) => {
    if (signal.aborted) throw new Error("Cancelled");
    return "Author-owned readonly data";
  } })],
  pluginWiring: { create: createBackupFormalPlatform, prepare: prepareBackupPlugin,
    configure: (platform, plugins) => configureBackupFormalPlatform(platform, { plugins }) },
});
// Leave this page/session: runtime.dispose();
```

root需处于当前document且已连接。A的设置恢复在register后、start和首次mount前进行，见配套测试。
已有备份应用会装配notation.core，因此不能再传C抢占同一个stage；替换由应用独立装配方案决定。
测试页面的DOM替身不证明字体、像素、实际Windows事件或真实作品正确性。

配套回归记录每轮受控资源：100次A/B/C会话与隐藏移动、100次实际组合根启动释放、100组逆序读取，
并单独验证失败重试、释放后的结果、命令禁用及参数/Promise结果。它检查拥有的订阅、cell、目录、菜单、
快捷键、root和窗口监听归零，不宣称JS堆绝对不增长或商业容量已达标。
