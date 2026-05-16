# 文档总览

本文档用于说明 `docs/` 目录里每份文档的定位，以及推荐阅读顺序。

## 阅读顺序

### 使用者

1. 仓库根目录 [README.md](../README.md)
2. [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md)
3. 需要排查同步异常时再看 [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md)

### 维护者 / 二次开发者

1. [ARCHITECTURE.md](./ARCHITECTURE.md)
2. [LOGIC_REFERENCE.md](./LOGIC_REFERENCE.md)
3. [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md)
4. [DEVELOPMENT.md](./DEVELOPMENT.md)
5. [CODE_STANDARDS.md](./CODE_STANDARDS.md)
6. [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md)
7. [REGRESSION_CHECKLIST.md](./REGRESSION_CHECKLIST.md)

## 文档分工

### [ARCHITECTURE.md](./ARCHITECTURE.md)

回答这些问题：

- 项目分成哪些层
- 每个目录和模块各自负责什么
- 主同步链路怎么流转
- 自定义属性、用户数据保护、状态同步分别落在哪些模块

适合在你需要建立整体心智模型时阅读。

### [LOGIC_REFERENCE.md](./LOGIC_REFERENCE.md)

回答这些问题：

- 模板为什么会命中某一类
- 条目为什么会被判定为已同步 / 未同步
- 为什么某个字段会进入自定义属性弹窗
- 强制同步、导入导出、状态同步各自怎么判断

适合在你需要追“为什么代码这么判断”时阅读。

### [TEMPLATE_GUIDE.md](./TEMPLATE_GUIDE.md)

回答这些问题：

- 模板支持哪些变量
- frontmatter 默认值怎么写
- 自定义属性如何通过模板驱动
- 列表、布尔、旧模板变量兼容如何工作

适合模板作者和自定义属性机制维护者阅读。

### [DEVELOPMENT.md](./DEVELOPMENT.md)

回答这些问题：

- 本地怎么开发和调试
- 发布流程是什么
- 提交前要跑哪些检查
- 自定义属性改动时需要同步检查哪些文件

适合仓库维护者阅读。

### [REGRESSION_CHECKLIST.md](./REGRESSION_CHECKLIST.md)

回答这些问题：

- 发布前除了 `lint / build / test` 还要手工确认什么
- Sandbox 里最重要的状态同步、短评、导入回归项有哪些

适合在发布前和修改高风险模块后快速对照执行。

### [CODE_STANDARDS.md](./CODE_STANDARDS.md)

回答这些问题：

- 当前项目遵守哪些 Obsidian 插件代码规范
- lint / 构建 / 审核最容易卡在哪些点
- 提交前的最小自查清单是什么

适合准备提交代码前快速自查。

### [STATUS_SYNC_PITFALLS.md](./STATUS_SYNC_PITFALLS.md)

回答这些问题：

- 状态同步和单集功能历史上踩过哪些坑
- 为什么某些实现不能随便简化
- 哪些字段或 DOM 状态必须同时维护

适合修改状态同步或单集功能时回看。

### [VERSION_HISTORY.md](./VERSION_HISTORY.md)

记录对外版本历史。

## 文档维护约束

- 模块职责变更时，优先更新 `ARCHITECTURE.md`
- 判断逻辑变更时，优先更新 `LOGIC_REFERENCE.md`
- 模板变量、模板默认值、自定义属性写法变更时，优先更新 `TEMPLATE_GUIDE.md`
- 发布流程和维护流程变更时，更新 `DEVELOPMENT.md`
- 新增审核约束或常见 lint 失败原因时，更新 `CODE_STANDARDS.md`
- 调整人工回归重点或 Sandbox 验证方式时，更新 `REGRESSION_CHECKLIST.md`
