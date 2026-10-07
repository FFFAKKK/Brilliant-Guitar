# 独立 Agent

Node 宿主 + 简单 React 聊天界面，可脱离 Brilliant Guitar、Workbench、Tauri 和乐谱内核启动。与软件共用 `packages/agent-runtime` 中的 Pi 决策适配和 Controller。

要求 Node.js >= 22.19。在仓库根目录首次安装：

```powershell
npm --prefix packages/agent-runtime ci
npm --prefix apps/agent ci
npm run agent:dev
```

打开终端显示的本机地址，默认 `http://127.0.0.1:8787`。生产构建和启动：

```powershell
npm run agent:build
npm run agent:start
```

这些命令不会启动软件或构建乐谱内核。端口可通过 `npm --prefix apps/agent run start -- --port 8789` 指定。

在“设置”中选择 DeepSeek 或其他 OpenAI 兼容服务，填写服务地址与 API Key，点击“获取模型”后从供应商列表选择，也可手动填写自定义模型 ID。获取模型可在保存/启用之前进行，只读取供应商`/models`元数据；不保存草稿或启用Agent。服务地址包含供应商完整API前缀，例如兼容接口的`/v1`；查询保留该前缀。接口不支持或列表为空时使用自定义输入。

选择模型并保存后，手动启用 Agent。主动“测试连接”会请求生成；只打开页面、输入、保存配置和密钥不会请求供应商。DeepSeek 使用 Chat Completions，第一版关闭 thinking。获取列表不代表每个模型支持全部工具能力，可另行测试连接。

设置支持命名连接、新建/切换/删除，分别保存服务地址、模型和最近5个模型；供应商列表支持搜索。公共设置与上次选择保存在宿主数据目录，重启后恢复，但Agent仍需手动开启。聊天记录暂未持久化。

密钥默认只在当前 Node 进程内使用。Windows下可勾选“记住此连接的密钥”，由宿主使用当前用户DPAPI保护后保存；取消勾选并保存会移除密文，当前内存密钥仍可使用。其他平台暂不支持记住密钥。更换某个连接的服务地址或类型会清除其旧密钥并停用Agent；切换连接只使用该连接自己的密钥。浏览器不向模型服务直接请求，也不使用localStorage存储凭据。密文无法在当前用户下恢复时需要重新填写，不会静默复用别的连接。

默认数据目录是启动工作目录下`.agent-data`；以上根命令通过npm进入本包，通常位于`apps/agent/.agent-data`。可显式指定：

```powershell
npm --prefix apps/agent run start -- --data-dir ../../.agent-data --port 8789
```

同一数据目录只允许一个宿主使用。写入失败保留原配置；文件损坏或版本不支持时明确失败并保留文件。`.agent-data`是本地用户数据，不进入Git。

Enter 发送，Shift + Enter 换行；运行时可停止，新会话会取消旧请求并清空聊天。首版默认不注册工具，可通过运行包的工具端口扩展。软件内乐谱工具仍由软件宿主注册。

`npm run agent:typecheck`、`npm run agent:test` 验证公共合同、Pi 传输、HTTP/SSE 和本地模型 fixture。`npm --prefix apps/agent run smoke:fake` 运行明确标注的本地测试宿主，不调用真实服务。真实 DeepSeek 验收需要用户在 UI 自行填写密钥并提交请求。

Windows 本地 file 依赖使用 `.npmrc` 中的 `install-links=true`，避免需要创建符号链接。构建脚本先构建运行包并同步安装副本。若默认 npm cache 不可写，可用 `--cache <可写目录>` 指定安装缓存。
