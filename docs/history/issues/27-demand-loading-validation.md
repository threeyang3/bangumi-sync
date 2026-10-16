# Issue 27 demand loading validation

2026-10-15，在整批补链改进 `e427b29` 后处理 [Issue #27](https://github.com/threeyang3/bangumi-sync/issues/27)。当前需求表与 HTTP 边界见 maintainer/LOGIC_REFERENCE.md 第 22 节；模板用户说明见 user/TEMPLATE_GUIDE.md。

## Change

- 完整 subject 仍为路径和内容模板的必要输入，复用已有预览成功缓存。获取后复用实际模板选择器，根据角色变量、动画制作兜底及关联功能决定辅助 API；未提供需求回调的 getFullSubjectInfo 调用者保留四类资料获取行为。
- 渲染前仅在模板确实引用支持的 episodes / volumes_display 时加载章节。条件键、条件体和默认值中的变量保守计入，小说/漫画分类优先级与渲染器一致。现有路径 author/category/year 来自完整详情，不依赖辅助资料。
- 所有 BangumiClient 共用实际 API HTTP 名额，认证、收藏探测和普通请求都经过调度。重试退避不占名额；超时不释放尚未结束的底层请求。取消/卸载或账号变化会拒绝过期响应和未开始的请求，取消后不继续重试。
- 同步与预览使用 1–5 上限，应用/恢复设置同步更新预算，面板预览使用同一并发设置。此预算不覆盖独立封面/CDN 下载或另一次插件加载中的请求；SDK 不能中断已经发出的 HTTP。
- 不新增设置 schema，不改变路径规则、事务、journal、分页端点或状态同步写入规则。原有章节失败/状态失败降级保留；必要辅助资料失败仍作为准备失败处理。

## Automated validation

Node.js 22.23.3：npm ci、lint、46 个测试文件/379 项测试、production build、docs:check、git diff --check 通过。

新增覆盖：实际类别/fallback 模板、条件与默认值、角色 1–9、制作公司 infobox/Copyright 优先、小说卷数和漫画/三次元章节、混合类别与渲染器一致、关闭关联功能、模板无关联字段但功能开启、最小模板的完整 subject 和 author/year 路径、角色/CV/人物/观看状态输出、空章节及状态失败。共享 HTTP 测试覆盖多客户端和 getFullSubjectInfo 扇出、认证/收藏探测、取消、账号切换及退避中切换、退避释放名额、预览超时保留实际 HTTP 名额。

## Production Obsidian Sandbox

Obsidian 1.14.4、独立 Vault/profile，合成收藏。本轮没有替换生产客户端的传输：真实 Obsidian requestUrl 访问仅监听 127.0.0.1 的 Node HTTP fixture 服务，服务端记录实际请求数和并发；不访问真实 Bangumi 账号。三项 production assets 已部署，main.js 本地/部署 SHA-256 均为 `E1E278F0AA81FBB020B9E166F75BECAEC94E08396ADFAE9375083E7A838CFF94`。

| 场景 | 实际 API 请求 / 验证 |
| --- | --- |
| 最小模板导入 1303 个音乐条目 | 1303 次完整详情；校验全部文件 ID 与约 2 KiB 的完整摘要 |
| 同时另一客户端全量资料及认证 | 另加 5 请求，总计 1308，最大 HTTP 在途为 3 |
| 动画角色、CV、图片、制作公司人物兜底、episodes | 5 请求，包含 watched 标记及完整角色/制作公司 |
| 动画最小模板 | 1 请求 |
| 小说 volumes_display / 漫画 episodes / 三次元 episodes | 各 3 请求，包含用户观看状态；小说 author 路径保留 |
| 制作公司已有 infobox 值 | 1 请求，未请求人物 |
| 混合小说/漫画类别仅引用 episodes | 1 请求，与小说优先渲染行为一致 |
| 开启关联功能，模板无 related | 2 请求，外部目标正文保留并得到反向链接 |
| 10 条目并发 5，开始后取消 | 仅 5 个已在途请求，后续未发出，created=0，completion=cancelled |
| 实际手动预览 → 属性表单 → 选择 → 导入 | 认证 1 次、subject 1 次，导入没有重复详情请求 |

最小模板批次总耗时约 32.937 s，仅记录本机 fixture 情况，不用于推导真实 Bangumi 网络速度。服务端合成延迟为 5 ms，取消场景为 250 ms；最大并发在服务端测量，覆盖不同客户端对同一共享预算的竞争。

另验证实际设置保存流程：成功设为 1 后，独立客户端的 5 个全量资料/认证 HTTP 请求最大在途为 1；注入设置持久化失败后设置与预算仍为 1；恢复原设置 3 成功，manager 身份保持稳定。

最终构建的上述两组生产测试均 console error/runtime exception=0/0，终态 idle、无遗留 recovery journal。隔离 Obsidian 与本机 HTTP 服务已关闭。本轮未回复 issue、推送、合并或发布。
