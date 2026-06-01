# PaperAgent Chrome Extension

一键在 [PaperAgent](https://github.com/happyTonakai/paperagent) 中打开 arXiv 论文。

## 功能

在 arXiv 论文页面（`arxiv.org/abs/*`）的右侧栏「View PDF」「TeX Source」等链接下方，添加一个「在 PaperAgent 中打开」按钮。按钮样式与 arXiv 原生链接完全一致。

点击后自动：
1. 探测本地 PaperAgent 服务的端口（默认 8686～8785）
2. 打开 PaperAgent WebUI 并自动加载该论文
3. 论文摘要通过 SSE 实时流式输出

## 安装

### 开发模式加载

1. 在 Chrome 地址栏打开 `chrome://extensions`
2. 开启右上角的「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录（`extension/`）

## 使用方法

1. 确保 PaperAgent 已在本地运行
2. 打开任意 arXiv 论文页面（如 `https://arxiv.org/abs/2401.12345`）
3. 在右侧栏找到「在 PaperAgent 中打开」按钮并点击
4. 浏览器自动打开 PaperAgent WebUI，开始加载论文

## 自定义端口

如果你通过 `PAPER_ADDR` 环境变量指定了非默认端口，需要在扩展选项中配置：

1. 右键扩展图标 → **选项**
2. 在「自定义端口」中输入你的端口号
3. 点击保存

配置后，扩展会先尝试你指定的端口，未找到再回落自动探测。

## 工作原理

| 文件 | 职责 |
|------|------|
| **`content.js`** | 注入 arXiv 页面，在 `.full-text ul` 中追加「在 PaperAgent 中打开」链接 |
| **`background.js`** | Service Worker，端口探测 + 打开标签页。支持 `chrome.storage` 自定义端口 |
| **`options.html` / `options.js`** | 选项页，配置自定义端口 |
| **WebUI (`App.tsx`)** | 检测 URL 参数 `?url=...`，自动 POST 到 `/api/papers` 创建论文 |

## 注意

- 需要允许扩展访问 `http://localhost/*`
- PaperAgent 服务未运行时，按钮会显示「连接失败，点击重试」
