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

在“设置”中选择 DeepSeek 或其他 OpenAI 兼容服务，填写服务地址、模型 ID、API Key，保存后手动启用 Agent。主动“测试连接”会请求模型；只打开页面、保存配置和密钥不会请求模型。DeepSeek 使用 Chat Completions，第一版关闭 thinking，模型 ID 可编辑。

密钥只保存在当前 Node 宿主进程内，退出后失效；设置和聊天也未持久化。更换服务地址或服务类型会清除旧密钥并停用 Agent。浏览器没有向模型服务直接请求，也不使用 localStorage 存储凭据。

Enter 发送，Shift + Enter 换行；运行时可停止，新会话会取消旧请求并清空聊天。首版默认不注册工具，可通过运行包的工具端口扩展。软件内乐谱工具仍由软件宿主注册。

`npm run agent:typecheck`、`npm run agent:test` 验证公共合同、Pi 传输、HTTP/SSE 和本地模型 fixture。`npm --prefix apps/agent run smoke:fake` 运行明确标注的本地测试宿主，不调用真实服务。真实 DeepSeek 验收需要用户在 UI 自行填写密钥并提交请求。

Windows 本地 file 依赖使用 `.npmrc` 中的 `install-links=true`，避免需要创建符号链接。构建脚本先构建运行包并同步安装副本。若默认 npm cache 不可写，可用 `--cache <可写目录>` 指定安装缓存。
