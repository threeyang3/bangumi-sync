# 分类内置预览数据验证

日期：2026-10-28。

- 用七组虚构离线数据替换只有类型和标题的通用示例：动画、小说、漫画、画集、游戏、音乐、三次元。
- 分类叶节点保留自己的 category/platform；全局默认及书籍父节点采用小说示例。示例始终渲染所选节点的有效模板。
- 提供类型元数据、适用的角色和章节，以及虚构收藏评分、短评、标签和章节进度；不读取本地用户条目或账号数据。
- Node 22 完整本地闸门通过：npm ci、lint、61 个测试文件／566 项测试、production build、docs check、diff check。
- 自动化覆盖所有 34 个节点的模板组对应和全部叶节点分类、七组字段渲染、小说卷数与漫画／动画／影视章节、跨预览数据独立性。
- 隔离 production Obsidian Sandbox 实际打开七组模板预览，均存在渲染结果及预期类型资料；dev:errors 与 error-level console 无错误。驱动脚本位于本机 `E:/cctry/bangumi-template-system-20261027/typed-samples-qa.js`。
- 初次 UI 驱动使用了不存在的关闭按钮选择器，修正为调用已追踪 modal 的 close 后全组通过；该失败不属于插件运行时错误。
- 没有更新正式版本或发布 Tag；没有使用真实 API 数据。封面未填充，示例不等同于完整同步计划。

## 类型切换、缺失场景与 Dataview 显示

- 全局父节点提供七组样本，书籍父节点提供三组，叶节点类型固定；始终使用当前节点规则。父节点内置预设按样本类型选择，显式自定义／文件模板不变。
- 缺失场景清空中文名、日期、详细元数据、角色、章节与收藏，同时保留分类；可切回完整资料，场景互不污染。
- 渲染视图以本次生成的 frontmatter 显示简单 `this.属性`；缺失值显示 `—`。复杂表达式和 Dataview／DataviewJS 块显示为代码，不执行。原始生成 Markdown 保持不变，不创建临时笔记。
- Node 22 完整闸门：62 个文件／571 项测试，lint、build、文档检查与 diff check 通过。
- 生产 Sandbox 的十项断言通过：全局七组、游戏样本、Dataview 显示与源码保留、缺失字段、标题路径回退、完整资料恢复、书籍三组、画集数据和固定叶类型。无捕获插件错误或 error-level console 消息。
- UI 驱动按 option value 定位 Obsidian 下拉框，避免其额外 select DOM；路径测试在设置草稿中临时指定含标题的路径并恢复，不改变已保存设置。驱动：`E:/cctry/bangumi-template-system-20261027/preview-scenarios-qa.js`。
