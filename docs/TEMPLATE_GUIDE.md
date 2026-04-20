# Bangumi Sync 模板设计指南

本文档详细介绍 Bangumi Sync 插件支持的所有模板变量、语法特性和使用示例，帮助您自定义条目笔记的格式。

## 目录

- [基础语法](#基础语法)
- [变量分类](#变量分类)
- [高级语法](#高级语法)
- [模板示例](#模板示例)
- [注意事项](#注意事项)

---

## 基础语法

模板使用 `{{变量名}}` 格式插入变量，插件会在同步时自动替换为实际值。

```markdown
---
title: {{name_cn}}
rating: {{rating}}
---
```

如果变量值为空，该位置会留空。

---

## 变量分类

### 基础信息变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{id}}` | 条目 ID | `522` |
| `{{name}}` | 原名 | `コードギアス 反逆のルルーシュ` |
| `{{name_cn}}` | 中文名 | `叛逆的鲁鲁修` |
| `{{alias}}` | 别名 | 留空 |
| `{{summary}}` | 简介 | 条目简介文本 |
| `{{rating}}` | 评分 | `8.5` |
| `{{rank}}` | 排名 | `156` |
| `{{tags}}` | 用户标签 | `原创, 机战` |
| `{{cover}}` | 封面路径 | `assets/叛逆的鲁鲁修.jpg` |
| `{{bangumi_url}}` | Bangumi 链接 | `https://bgm.tv/subject/522` |

### 类型信息变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{type}}` | 条目类型编号 | `2` (动画) |
| `{{typeLabel}}` | 类型标签 | `Anime` |
| `{{category}}` | 细分类别 | `TV`, `OVA`, `小说`, `漫画` |

**type 编号对照表**:
- `1`: 书籍 (Book)
- `2`: 动画 (Anime)
- `3`: 音乐 (Music)
- `4`: 游戏 (Game)
- `6`: 三次元 (Real)

**typeLabel 对照表**:
- 书籍根据细分类别返回 `Novel`、`Comic`、`Album`
- 动画返回 `Anime`
- 音乐返回 `Music`
- 游戏返回 `Game`
- 三次元返回 `Real`

### 日期变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{date}}` | 发布日期 | `2006-10-05` |
| `{{year}}` | 年份 | `2006` |
| `{{month}}` | 月份 | `10` |

### 收藏信息变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{my_rate}}` | 我的评分 | `8` |
| `{{my_comment}}` | 我的短评 | `非常精彩！` |
| `{{my_status}}` | 收藏状态 | `已看✅` |
| `{{my_tags}}` | 我的标签 | `原创, 机战` |

**my_status 状态对照表**:
- 想看: `想看🕒`
- 看过: `已看✅`
- 在看: `在看▶️`
- 搁置: `搁置⏸️`
- 抛弃: `放弃❌`

---

## 条目特定变量

### 动画专用变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{episode}}` | 话数 | `25` |
| `{{director}}` | 导演 | `谷口悟朗` |
| `{{music}}` | 音乐 | `中川幸也` |
| `{{animeMake}}` | 动画制作 | `SUNRISE` |
| `{{musicMake}}` | 音乐制作 | `Victor Entertainment` |
| `{{staff}}` | 脚本/系列构成 | `大河内一楼` |
| `{{audioDirector}}` | 音响监督 | `浦上靖之` |
| `{{artDirector}}` | 美术监督 | `菱沼由典` |
| `{{animeChief}}` | 总作画监督 | `木村贵宏` |
| `{{from}}` | 原作 | `原创` |
| `{{website}}` | 官方网站 | `https://...` |

### 小说专用变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{author}}` | 作者 | `时雨泽惠一` |
| `{{illustration}}` | 插画 | `黑星红白` |
| `{{publish}}` | 出版社 | `角川书店` |
| `{{series}}` | 书系 | `电击文库` |
| `{{volumes}}` | 册数 | `10` |
| `{{journal}}` | 连载杂志 | `电击文库` |
| `{{status}}` | 完结状态 | `已完结` / `连载中` |
| `{{progress}}` | 进度 | `2000年2月 - 2005年10月` |
| `{{start}}` | 开始日期 | `2000年2月` |
| `{{end}}` | 结束日期 | `2005年10月` |
| `{{website}}` | 官方网站 | `https://...` |

### 漫画专用变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{author}}` | 作者 | `CLAMP` |
| `{{staff}}` | 作画 | `CLAMP` |
| `{{publish}}` | 出版社 | `讲谈社` |
| `{{journal}}` | 连载杂志 | `月刊少年GANGAN` |
| `{{episode}}` | 话数 | `108` |
| `{{status}}` | 完结状态 | `已完结` / `连载中` |
| `{{progress}}` | 进度 | `2001年3月 - 2010年9月` |
| `{{website}}` | 官方网站 | `https://...` |

### 游戏专用变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{platform}}` | 平台 | `PC, PS5, Switch` |
| `{{develop}}` | 开发商 | `FromSoftware` |
| `{{publish}}` | 发行商 | `Bandai Namco` |
| `{{playerNum}}` | 游玩人数 | `1人` |
| `{{script}}` | 剧本 | `宫崎英高` |
| `{{music}}` | 音乐 | `北村友里` |
| `{{art}}` | 原画 | `宫崎英高` |
| `{{director}}` | 导演 | `宫崎英高` |
| `{{producer}}` | 制作人 | `竹内将弘` |
| `{{price}}` | 售价 | `7,980日元` |
| `{{website}}` | 官方网站 | `https://...` |

### 画集专用变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{author}}` | 作者/画师 | `村田莲尔` |
| `{{publish}}` | 出版社 | `角川书店` |
| `{{pages}}` | 页数 | `128` |
| `{{isbn}}` | ISBN | `978-4-04-854123-4` |
| `{{website}}` | 官方网站 | `https://...` |

### 音乐专用变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{category}}` | 类型 | `专辑`, `单曲`, `原声带` |

### 三次元专用变量

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{category}}` | 类型 | `日剧`, `电影`, `综艺` |

---

## 角色变量

每个条目最多支持 9 个角色，变量格式为 `{{characterN}}`、`{{characterCVN}}`、`{{characterPhotoN}}`，其中 N 为 1-9。

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{character1}}` | 第1个角色名 | `鲁鲁修·兰佩路基` |
| `{{characterCV1}}` | 第1个角色声优 | `福山润` |
| `{{characterPhoto1}}` | 第1个角色图片 | 图片URL |
| `{{character2}}` | 第2个角色名 | `C.C.` |
| `{{characterCV2}}` | 第2个角色声优 | `由加奈` |
| ... | ... | ... |

---

## 评分明细变量

在同步预览弹窗中可以填写评分明细，不同类型条目支持不同的评分维度。

### 动画评分明细

| 变量 | 说明 |
|------|------|
| `{{rating_music}}` | 音乐评分 |
| `{{rating_character}}` | 人设评分 |
| `{{rating_story}}` | 剧情评分 |
| `{{rating_art}}` | 美术评分 |

### 小说评分明细

| 变量 | 说明 |
|------|------|
| `{{rating_story}}` | 剧情评分 |
| `{{rating_illustration}}` | 插画评分 |
| `{{rating_writing}}` | 文笔评分 |
| `{{rating_character}}` | 人设评分 |

### 漫画评分明细

| 变量 | 说明 |
|------|------|
| `{{rating_story}}` | 剧情评分 |
| `{{rating_drawing}}` | 画工评分 |
| `{{rating_character}}` | 人设评分 |

### 游戏评分明细

| 变量 | 说明 |
|------|------|
| `{{rating_story}}` | 剧情评分 |
| `{{rating_fun}}` | 趣味评分 |
| `{{rating_music}}` | 音乐评分 |
| `{{rating_art}}` | 美术评分 |

---

## V4 章节变量

V4 版本新增章节追踪功能，支持显示集数、卷数、话数。

| 变量 | 说明 | 适用类型 | 示例输出 |
|------|------|----------|----------|
| `{{episodes}}` | 集数显示 | 动画、漫画 | `<span class="ep-box">1</span> <span class="ep-box watched">2</span>...` |
| `{{volumes_display}}` | 卷数显示 | 小说 | `<span class="ep-box">1</span> <span class="ep-box">2</span>...` |

**章节显示特性**:
- 已看集数会添加 `watched` 类名，显示高亮样式
- 鼠标悬浮显示集数标题、放送日期、时长
- 需要在 `styles.css` 中定义 `.ep-box` 样式

---

## 高级语法

### 条件渲染

使用 `{{#if 变量}}...{{/if}}` 语法，当变量有值时显示内容。

```markdown
---
{{#if my_rate}}my_rate: {{my_rate}}{{/if}}
{{#if my_comment}}comment: {{my_comment}}{{/if}}
---
```

### 默认值

使用 `{{变量|默认值}}` 语法，当变量为空时显示默认值。

```markdown
---
rating: {{rating|未评分}}
director: {{director|未知}}
---
```

---

## 模板示例

### 动画模板

```markdown
---
id: {{id}}
title: {{name_cn}}
type: {{typeLabel}}
category: {{category}}
rating: {{rating}}
rank: {{rank}}
my_rate: {{my_rate}}
status: {{my_status}}
tags: {{my_tags}}
date: {{date}}
director: {{director}}
studio: {{animeMake}}
episodes: {{episode}}
bangumi: {{bangumi_url}}
---

# {{name_cn}}

![]({{cover}})

## 基本信息

| 项目 | 内容 |
|------|------|
| 原名 | {{name}} |
| 评分 | ★{{rating}} (排名 #{{rank}}) |
| 话数 | {{episode}} |
| 导演 | {{director}} |
| 制作 | {{animeMake}} |
| 原作 | {{from}} |

## 简介

{{summary}}

## 集数

{{episodes}}

## 我的评价

> [!note] 短评
> {{my_comment}}

{{#if rating_music}}
### 评分明细

- 音乐：{{rating_music}}
- 人设：{{rating_character}}
- 剧情：{{rating_story}}
- 美术：{{rating_art}}
{{/if}}

## 角色

1. {{character1}} (CV: {{characterCV1}})
2. {{character2}} (CV: {{characterCV2}})
3. {{character3}} (CV: {{characterCV3}})
```

### 小说模板

```markdown
---
id: {{id}}
title: {{name_cn}}
type: {{typeLabel}}
category: {{category}}
rating: {{rating}}
my_rate: {{my_rate}}
status: {{my_status}}
tags: {{my_tags}}
author: {{author}}
illustration: {{illustration}}
publish: {{publish}}
series: {{series}}
volumes: {{volumes}}
bangumi: {{bangumi_url}}
---

# {{name_cn}}

![]({{cover}})

## 基本信息

| 项目 | 内容 |
|------|------|
| 原名 | {{name}} |
| 作者 | {{author}} |
| 插画 | {{illustration}} |
| 出版社 | {{publish}} |
| 书系 | {{series}} |
| 册数 | {{volumes}} |
| 状态 | {{status}} |

## 简介

{{summary}}

## 我的评价

> [!note] 短评
> {{my_comment}}

{{#if rating_story}}
### 评分明细

- 剧情：{{rating_story}}
- 插画：{{rating_illustration}}
- 文笔：{{rating_writing}}
- 人设：{{rating_character}}
{{/if}}
```

### 游戏模板

```markdown
---
id: {{id}}
title: {{name_cn}}
type: {{typeLabel}}
category: {{category}}
rating: {{rating}}
my_rate: {{my_rate}}
status: {{my_status}}
tags: {{my_tags}}
platform: {{platform}}
developer: {{develop}}
bangumi: {{bangumi_url}}
---

# {{name_cn}}

![]({{cover}})

## 基本信息

| 项目 | 内容 |
|------|------|
| 原名 | {{name}} |
| 平台 | {{platform}} |
| 开发 | {{develop}} |
| 发行 | {{publish}} |

## 简介

{{summary}}

## 我的评价

> [!note] 短评
> {{my_comment}}

{{#if rating_story}}
### 评分明细

- 剧情：{{rating_story}}
- 趣味：{{rating_fun}}
- 音乐：{{rating_music}}
- 美术：{{rating_art}}
{{/if}}
```

---

## 注意事项

### 1. 变量值为空的处理

当变量没有值时，模板中对应位置会留空。建议：
- 使用默认值语法：`{{director|未知}}`
- 使用条件渲染：`{{#if director}}导演：{{director}}{{/if}}`

### 2. 短评换行

`{{my_comment}}` 变量支持换行，建议放在 Obsidian Callout 中：

```markdown
> [!note] 短评
> {{my_comment}}
```

### 3. 章节显示样式

`{{episodes}}` 和 `{{volumes_display}}` 生成的是 HTML，需要在 `styles.css` 中定义样式：

```css
.ep-box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2em;
  height: 2.2em;
  border: 1px solid var(--text-muted);
  border-radius: 4px;
  margin: 2px;
  font-size: 13px;
  cursor: pointer;
}

.ep-box.watched {
  background-color: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}
```

### 4. 路径模板变量

文件保存路径也支持模板变量：

- `{{type}}`: 条目类型 (anime/game/novel/comic/album/music/real)
- `{{category}}`: 细分类别
- `{{name}}`: 原名
- `{{name_cn}}`: 中文名
- `{{year}}`: 年份
- `{{author}}`: 作者
- `{{id}}`: 条目 ID

示例：`ACGN/{{type}}/{{name_cn}}.md` → `ACGN/anime/叛逆的鲁鲁修.md`

### 5. 图片路径变量

封面图片保存路径支持：

- `{{id}}`: 条目 ID
- `{{name_cn}}`: 中文名
- `{{name}}`: 原名
- `{{typeLabel}}`: 类型标签 (Anime/Game/Novel/Comic/Music/Real)

示例：`assets/{{name_cn}}_{{typeLabel}}.jpg` → `assets/叛逆的鲁鲁修_Anime.jpg`

---

## 版本兼容性

| 功能 | V1 | V2 | V3 | V4 |
|------|----|----|----|----|
| 基础变量 | ✅ | ✅ | ✅ | ✅ |
| 用户标签 | ❌ (使用公共标签) | ✅ | ✅ | ✅ |
| 评分明细 | ❌ | ✅ | ✅ | ✅ |
| 章节变量 | ❌ | ❌ | ❌ | ✅ |
| 条件渲染 | ❌ | ❌ | ❌ | ✅ |
| 默认值 | ❌ | ❌ | ❌ | ✅ |

---

## 常见问题

### Q: 为什么我的标签显示为空？

A: V2+ 版本使用用户自己在 Bangumi 上标注的标签，如果未标注则留空。V1 版本使用公共标签。

### Q: 如何显示角色图片？

A: 使用 `{{characterPhotoN}}` 变量，但需要注意：
- 角色图片是远程 URL，需要网络才能显示
- 建议只在需要时使用，避免加载过多图片

### Q: 章节显示不正常怎么办？

A: 确保：
1. 使用 V4 版本
2. `styles.css` 中包含 `.ep-box` 样式定义
3. 条目有章节信息（动画、小说、漫画）

---

如有其他问题，请在 [GitHub Issues](https://github.com/threeyang3/bangumi-sync/issues) 反馈。
