# 同作品重开后双谱一致性：修复验证

日期：2026-10-22。基线：`e6ef6b770a6840de4dfb26dd64e6ea90ce5df852`。修复位于本地 `codex/fix-document-reopen-projection` 分支，尚未合并到 main 或推送。

## 结论

AUD-01已修复：经原owner接受的同ID重开7→0会更新谱面，不再卡在旧版本。AUD-02已同步：只读staff/Tab呈现已接入，Tab编辑仍待开发。原界面、文件格式、原生IPC、历史与保存权威均未改动。

## 修复方式

- 原文档owner的读取订阅附带冻结的可选`document-read-change`，携带本地`replacementGeneration`。只在接受guarded new/open/openRecent时推进；普通读取、编辑、历史、保存、取消和接受前失败不推进。
- 原投影按已接受替换代次区分重开与过期读取。同代次/ID仍拒绝版本倒退，旧无参数订阅仍可用，不要求宿主有persistence字段。
- 完整staff/Tab校验成功后才推进已接受水位；坏双谱保留旧谱面并允许修正后重试。原请求token、释放与观察者隔离继续有效。

## 最终检查

| 检查 | 结果 |
| --- | --- |
| Workbench整包 | 876/876 |
| 备份UI整包 | 1025/1025 |
| 根、Workbench生产及测试三组no-emit | 通过 |
| 原desktop构建及`--check` | 通过，21项资源闭包 |
| 原审计复现脚本，不改脚本运行`--expect-fixed` | 通过：owner/projection均v0、132 BPM，reload仍132 |

永久回归覆盖代次推进/不推进、旧订阅、观察者抛错/异步拒绝、低/同版本重开、同代次stale、非法/倒退代次、坏双谱后重试、晚到/释放及无persistence的真实runtime/router组合。新增核心回归先复现失败，再随修复通过。

## 浏览器实际观察

使用[独立样本](preview.html)与真实生产owner、composition、router和共享renderer；仅模拟文件对话框/IO结果，不操作真实作品。用现有文件菜单依次打开同ID样本A（v7，96 BPM）及B（v0，132 BPM）。

- 可见Tab首音3品→5品，staff对应C→D；谱面与owner均v0、132 BPM。
- 已选Tab及125.5%缩放保持；原菜单重读继续显示新内容。
- Tab内音名输入及Delete没有派发写入。
- 有persistence和`?legacy=1`无persistence两种宿主均通过；最终生成件重新加载后确认无persistence路径及实际Tab绘制。

详尽命令、时间、原始失败/成功日志与截图保留于本地任务记录，归档位置为`.trellis/tasks/archive/2026-10/10-22-document-reopen-projection-consistency/`。首次整包暴露了新增测试使用非法requestId的夹具错误，改为原合同要求的UUID后通过；生产协议未为夹具放宽。

本次未重建EXE或运行原生文件对话框；原生文件算法/IPC未变化。本报告的浏览器模拟IO结果用于接受本次投影修复。

## 重放

从`design/frame-visual`运行原`python -u scripts/serve-preview.py --port 5193`，打开`evidence/document-reopen-20261022/preview.html`。首次“打开作品”提供A，后续提供B；`legacy=1`省略宿主persistence。

工程检查使用原入口，不运行会额外修改依赖的npm prehook：

```powershell
# apps/workbench
node --experimental-strip-types --test "test/*.test.ts"
# design/frame-visual
node --test --test-isolation=none "tests/*.test.js"
node scripts/build-desktop.mjs --check
```
