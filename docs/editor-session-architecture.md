# 谱面编辑会话分层

当前五线谱编辑按以下路径运行：

```text
键盘／鼠标／音符控制组件
    → 五线谱输入规则（staff-input-adapter、use-note-overview）
    → 工作台编辑会话（editor-machine、use-score-input）
    → 应用编辑意图（score-edit-intent）
    → WorkbenchClient／ScoreSessionService
    → Core 命令与事务
    → 只读谱面投影
```

`editor-machine.ts` 只管理交互状态：编辑目标、尚未完成的输入和异步事务。编辑目标要么是空位，要么是已有事件；事件选择只保存 ID 和定位点，事件内容始终从最新谱面投影读取。输入草稿不会写入 Core，提交后才由应用层发送带版本号和请求 ID 的命令。确定被拒绝的编辑保持当前选择并允许重新操作；结果不确定的请求保留同一请求 ID 供重试。

状态机以定位点和草稿类型为参数，不包含五线谱音名、吉他弦号、指板位置或键盘映射。现在的 `ScoreEditPoint` 是五线谱定位点；以后六线谱可以使用自己的定位点和输入规则，复用状态转换。`staff-input-adapter.ts` 负责将五线谱输入变为插入、修改、删除意图；撤销、重做和文档标题命令由 `score-edit-intent.ts` 统一接线，不属于五线谱语法。

Core 继续拥有乐谱文档、书写音高、时值、容量校验、原子事务和撤销历史。五线谱输入发送的是 Core 使用的书写音高数据；实际发声音高由 Core 的移调规则推导，不在编辑状态机中另存一份。现有 `ScoreSessionService` 将应用编辑命令映射到 `core.voice.insert-notes-event`、`core.voice.insert-rest-event`、事件属性命令和 `core.transaction.batch`。本轮没有修改 Core 文档结构或插件布局格式。

这轮实现的是可复用的编辑会话骨架和现有五线谱接线。六线谱输入适配、更多编辑目标类型及插件化注册仍应在相应功能开发时单独设计。
