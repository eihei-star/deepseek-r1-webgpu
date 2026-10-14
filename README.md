# DeepSeek-R1 WebGPU Lab

在浏览器 Web Worker 中通过 Transformers.js 和 WebGPU 运行
`onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX`。本项目没有服务器推理兜底；不支持 WebGPU 时会明确提示。

> 首次下载模型需要网络，推理内容不发送到业务服务器；缓存完成后可尝试离线运行。

## 当前完成度

- P0 代码闭环：已实现 WebGPU adapter 检测、Tokenizer 与 Causal LM 加载、chat template、真实 `model.generate()`、流式输出和性能统计。
- P1 产品闭环：已实现文件/总体进度、typed Worker 协议、停止生成、清空对话、重置 Worker、错误恢复和响应式中文 UI。
- P2 离线与证据：应用 shell Service Worker 已实现；真实 WebGPU 模型加载、生成和 Offline 刷新仍需在支持设备上验证。未经真实设备验证，不声称 P2 已通过。

## 架构

```text
React UI / reducer
       │ typed postMessage
       ▼
Web Worker
  ├─ WebGPU requestAdapter()
  ├─ AutoTokenizer
  ├─ AutoModelForCausalLM (q4f16/q4, webgpu)
  ├─ TextStreamer
  └─ InterruptableStoppingCriteria
       │
       └─ Transformers.js / ONNX Runtime Web / GPU
```

模型、Tokenizer、Tensor 和生成过程只存在于 Worker；React 主线程只保存消息、进度与统计数据。

## 环境要求

- 推荐最新版桌面 Chrome 或 Edge。
- 页面必须运行在 HTTPS 或 `localhost` 安全上下文。
- 浏览器必须能返回 `navigator.gpu.requestAdapter()`。
- 建议至少 8 GB 系统内存。1.5B 模型仍可能因浏览器、集成显卡共享内存或驱动限制而加载失败。
- Safari、Firefox、移动浏览器和无 WebGPU adapter 的设备不在当前验证范围内。

可在 `chrome://gpu` 或 `edge://gpu` 检查 WebGPU 状态。

## 安装与运行

```powershell
git clone https://github.com/eihei-star/deepseek-r1-webgpu.git
cd deepseek-r1-webgpu
pnpm install
pnpm dev
```

打开 Vite 输出的 localhost 地址，设备检测通过后手动点击“加载 1.5B 模型”。应用不会在首次打开时自动消耗模型下载流量。

生产构建与本地预览：

```powershell
pnpm run build
pnpm run preview
```

静态检查和单元测试：

```powershell
pnpm run lint
pnpm test
```

## 模型与生成参数

- 模型：`onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX`
- 设备：`webgpu`
- dtype：支持 `shader-f16` 时使用模型仓库官方示例推荐的 `q4f16`；否则回退 `q4`。
- 默认最大输出：256 tokens，可切换为 128/256/512。
- 默认采样：`temperature: 0.2`、`top_p: 0.9`。
- 只保留最近 8 条上下文消息，并将 tokenization 上限设为 2048，降低浏览器端内存压力。

`q4f16` 模型文件约 1.37 GB，明显小于约 1.97 GB 的 `q4` 文件，也与模型仓库的 Transformers.js 官方示例一致，可降低支持 fp16 的 GPU 上的加载压力。没有 `shader-f16` 时使用 q4 兼容路径。实际 GPU 内存还包含运行时缓冲区、KV cache 和中间张量，不能只按模型文件大小估算；首次加载前请预留数 GB 网络流量与可用空间。

## 缓存与离线边界

项目有两层缓存：

1. Transformers.js 管理模型文件缓存。
2. `public/sw.js` 只缓存同源应用 shell 和构建产物。

Service Worker 明确不拦截或复制 Hugging Face 的跨域模型响应，避免把 GB 级模型重复存储。首次模型下载必须联网。只有在同一浏览器配置中完整加载过应用和模型，才具备尝试离线运行的前提；浏览器清理站点数据、隐私模式、缓存配额回收或库缓存未命中都会使离线加载失败。

建议按以下步骤做 P2 实测：

1. `pnpm run build` 后运行 `pnpm run preview`。
2. 在线完成模型加载，并生成一次非空回答。
3. 关闭并重新打开页面，确认缓存后二次加载。
4. DevTools 切换 Offline 后刷新。
5. 确认应用能打开、模型能再次 ready，并完成一次生成。

当前仓库没有附带已经通过以上流程的设备记录，因此 UI 使用“可尝试离线运行”，而不是保证“完全离线可用”。

## 隐私说明

- 用户输入、对话上下文和模型输出仅传给当前页面的本地 Worker，不发送到本项目的业务服务器。
- 首次加载及缓存未命中时，浏览器会访问 Hugging Face 获取模型和配置文件；这些请求仍会向资源提供方暴露常规网络元数据，例如 IP、User-Agent 和请求的模型文件。
- 页面不使用远程推理 API，也不把消息写入应用自己的后端。

## 关键交互

- Enter 发送，Shift+Enter 换行。
- 生成期间禁止第二次提交。
- “停止生成”触发 `InterruptableStoppingCriteria`，保留已经生成的文字。
- “清空对话”只清消息，不卸载模型。
- “重置模型”终止旧 Worker、释放其持有的 GPU 资源，并创建新 Worker 重新检测设备。
- 模型输出按纯文本渲染，不执行模型返回的 HTML。

## 常见问题

### 页面显示不支持 WebGPU

确认使用最新版桌面 Chrome/Edge、HTTPS 或 localhost，并检查 `chrome://gpu` / `edge://gpu`。仅存在 `navigator.gpu` 不够，浏览器还必须成功返回 adapter。

### adapter 为空

更新显卡驱动，检查浏览器硬件加速是否开启，并避免在不支持 GPU 转发的远程桌面或虚拟机环境中测试。

### 模型下载失败

检查 Hugging Face 是否可访问、磁盘/浏览器站点配额是否充足，然后返回加载页重试。企业代理、内容拦截器和网络中断都可能破坏大文件下载。

### GPU 进程崩溃或内存不足

关闭占用 GPU/内存的标签页和程序，重启浏览器后重试。集成显卡通常使用共享内存，系统内存充足不代表单次 GPU buffer 一定可分配。

若旧版 q4 加载失败后再升级到 q4f16，浏览器可能同时保留约 1.97 GB 的旧 q4 文件和新的 q4f16 文件。可在 DevTools → Application → Storage 中清除当前站点数据，再刷新页面重新下载；这会删除本项目的模型缓存，需要重新联网加载。

### 重置后为什么需要重新点“加载模型”

重置会终止 Worker 以可靠释放模型和 GPU 资源。模型文件通常仍在浏览器缓存中，但模型对象必须重新实例化。

## 验证状态

自动检查以当前工作区实际命令结果为准。单元测试不下载模型，覆盖：

- 状态机合法/非法转换与生成并发保护。
- stale requestId、delta、complete、interrupted 和 error。
- 未知 total、0 字节、NaN 和多文件进度。
- Worker 重启时的终止、监听器清理和重新检测。
- Worker 响应运行时校验。

真实浏览器 smoke test 需要支持 WebGPU 的 Chrome/Edge 与足够硬件资源。尚未实测的浏览器/GPU、首次加载耗时、二次加载耗时、tokens/s、Stop/Reset 和 Offline 刷新不会在本文档中虚构数据。

## 代码来源说明

核心浏览器推理能力来自 [Transformers.js](https://github.com/huggingface/transformers.js) 与模型发布者提供的 ONNX 模型。项目使用其公开 API 与类型声明进行集成；依赖许可证和模型许可证以各自上游仓库为准。
