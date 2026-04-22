/**
 * 默认模板定义
 *
 * 提供两套模板：
 * - 标准模板（STANDARD）：只包含 Bangumi 数据，适合普通用户
 * - 作者自用模板（AUTHOR）：包含自定义变量，适合资源管理
 *
 * 自定义变量说明：
 * - 标语：用户自定义标语
 * - 评分明细：各维度评分（需在同步时手动填写）
 * - 单评：是否单集评论
 * - 存储/资源属性：资源存储信息
 * - 版本/格式/Kindle：电子书版本信息
 * - 渠道/已购：购买渠道和状态
 * - 相关：相关作品链接
 */

// ==================== 标准模板（只含 Bangumi 数据）====================

// 动画标准模板
export const ANIME_TEMPLATE_STANDARD = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
观看状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
短评: "{{my_comment}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
封面: "{{cover}}"
开播时间: "{{year}} 年 {{month}} 月"
集数: "{{episode}}"
动画公司: "{{animeMake}}"
导演: "{{director}}"
音乐: "{{music}}"
官方网站: "{{website}}"
---

> [!bangumi-info]+ 📺 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 状态 |\`= this.观看状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 放送 | {{year}} 年 {{month}} 月 |
> | 集数 | {{category}} 共{{episode}}话 |
> | 制作 | {{animeMake}} |
> | 导演 | {{director}} |
> | 音乐 | {{music}} |

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  {{character1}} | {{character2}}   |   {{character3}}  |
|:------:|:----------------:| :--------------- : |
|  {{characterCV1}} | {{characterCV2}}   |   {{characterCV3}}  |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| {{character4}}  |  {{character5}}  | {{character6}}  |
|  {{characterCV4}} | {{characterCV5}}   |   {{characterCV6}}  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| {{character7}}  |  {{character8}}  | {{character9}}  |
|  {{characterCV7}} | {{characterCV8}}   |   {{characterCV9}}  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 集数

{{episodes}}

## 记录

## 感想
`;

// 小说标准模板
export const NOVEL_TEMPLATE_STANDARD = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
作者: "{{author}}"
插画: "{{illustration}}"
阅读状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
短评: "{{my_comment}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
书系: "{{series}}"
进度: "{{progress}}"
册数: "{{volumes}}"
封面: "{{cover}}"
发行日期: "{{date}}"
出版社: "{{publish}}"
官网: "{{website}}"
---

> [!bangumi-info]+ 📚 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 作者 |\`= this.作者\`|
> | 插画 |\`= this.插画\`|
> | 状态 |\`= this.阅读状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 进度 |\`= this.进度\`|
> | 书系 |\`= this.书系\`|
> | 册数 |{{volumes}}|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------:|:----------------:| :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 记录

## 感想
`;

// 漫画标准模板
export const COMIC_TEMPLATE_STANDARD = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
阅读状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
短评: "{{my_comment}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
话数: "{{episode}}"
进度: "{{progress}}"
杂志: "{{journal}}"
作者: "{{author}}"{{#if staff}}
作画: "{{staff}}"{{/if}}
封面: "{{cover}}"
出版社: "{{publish}}"
---

> [!bangumi-info]+ 📚 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 状态 |\`= this.阅读状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 作者 |\`= this.作者\`|{{#if staff}}
> | 作画 |\`= this.作画\`|{{/if}}
> | 杂志 |\`= this.杂志\`|
> | 进度 |\`= this.进度\`|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------:|:----------------:| :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 记录

## 感想
`;

// 游戏标准模板
export const GAME_TEMPLATE_STANDARD = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
游玩状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
短评: "{{my_comment}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
开发: "{{develop}}"
发行: "{{publish}}"
发行日期: "{{date}}"
游玩人数: "{{playerNum}}"
官网: "{{website}}"
封面: "{{cover}}"
---

> [!bangumi-info]+ 🎮 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 状态 |\`= this.游玩状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 开发 |\`= this.开发\`|
> | 发行 |\`= this.发行\`|
> | 官网 |\`= this.官网\`|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------:|:----------------:| :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 记录

## 感想
`;

// 画集标准模板
export const ALBUM_TEMPLATE_STANDARD = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
作者: "{{author}}"
阅读状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
短评: "{{my_comment}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
页数: "{{pages}}"
ISBN: "{{isbn}}"
封面: "{{cover}}"
发行日期: "{{date}}"
出版社: "{{publish}}"
---

> [!bangumi-info]+ 📖 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 作者 |\`= this.作者\`|
> | 状态 |\`= this.阅读状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 页数 |\`= this.页数\`|
> | ISBN |\`= this.ISBN\`|
> | 发行 |{{date}}|
> | 出版社 |{{publish}}|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]+ **简介**
> {{summary}}

## 记录

## 感想
`;

// 音乐标准模板
export const MUSIC_TEMPLATE_STANDARD = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
收藏状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
短评: "{{my_comment}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
封面: "{{cover}}"
发行日期: "{{date}}"
---

> [!bangumi-info]+ 🎵 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 发行 |{{date}}|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]+ **简介**
> {{summary}}
`;

// 三次元标准模板
export const REAL_TEMPLATE_STANDARD = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
观看状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
短评: "{{my_comment}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
封面: "{{cover}}"
上映日期: "{{date}}"
---

> [!bangumi-info]+ 🎬 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 状态 |\`= this.观看状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 上映 |{{date}}|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]+ **简介**
> {{summary}}
`;

// ==================== 作者自用模板（含自定义变量）====================

// 动画作者自用模板
export const ANIME_TEMPLATE_AUTHOR = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
观看状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
音乐评分: {{rating_music}}
人设评分: {{rating_character}}
剧情评分: {{rating_story}}
美术评分: {{rating_art}}
标语:
单评: false
精彩片段:
笔记: "{{note_link}}"
存储:
资源属性:
相关:
  -
作品大类: Anime
具体类型: "{{category}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
封面: "{{cover}}"
开播时间: "{{year}} 年 {{month}} 月"
集数: "{{episode}}"
动画公司: "{{animeMake}}"
导演: "[[{{director}}]]"
音乐: "[[{{music}}]]"
官方网站: "{{website}}"
---

> [!bangumi-info]+ 📺 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 标语 |\`= this.标语\`|
> | 状态 |\`= this.观看状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 明细 |音乐: \`= this.音乐评分\` 人设: \`= this.人设评分\` 剧情: \`= this.剧情评分\` 美术: \`= this.美术评分\`|
> | 笔记 | \`= this.笔记\`|
> | 放送 | {{year}} 年 {{month}} 月 |
> | 集数 | {{category}} 共{{episode}}话 |
> | 精彩片段 | \`= this.精彩片段\` |
> | 导演 | {{director}} |
> | 音乐 | {{music}} |
> | 存储 | \`= this.存储\`·\`=this.资源属性\` |
> | 相关 | \`= this.相关\` |

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  {{character1}} | {{character2}}   |   {{character3}}  |
|:------:|:----------------:| :--------------- : |
|  {{characterCV1}} | {{characterCV2}}   |   {{characterCV3}}  |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| {{character4}}  |  {{character5}}  | {{character6}}  |
|  {{characterCV4}} | {{characterCV5}}   |   {{characterCV6}}  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| {{character7}}  |  {{character8}}  | {{character9}}  |
|  {{characterCV7}} | {{characterCV8}}   |   {{characterCV9}}  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 集数

{{episodes}}

## 记录

## 感想
`;

// 小说作者自用模板
export const NOVEL_TEMPLATE_AUTHOR = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
作者: "[[{{author}}]]"
插画: "[[{{illustration}}]]"
阅读状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
剧情评分: {{rating_story}}
插画评分: {{rating_illustration}}
文笔评分: {{rating_writing}}
人设评分: {{rating_character}}
标语:
单评: false
精彩片段:
笔记: "{{note_link}}"
版本:
Kindle: false
保存: true
相关:
  -
渠道:
官网: "{{website}}"
已购: false
作品大类: Novel
具体类型: "{{category}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
书系: "{{series}}"
进度: "{{progress}}"
册数: "{{volumes}}"
封面: "{{cover}}"
开始:
发行日期: "{{date}}"
出版社: "{{publish}}"
---

> [!bangumi-info]+ 📚 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 标语 |\`= this.标语\`|
> | 作者 |\`= this.作者\`|
> | 插画 |\`= this.插画\`|
> | 状态 |\`= this.阅读状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 明细 | 剧情: \`= this.剧情评分\` 插画: \`= this.插画评分\` 文笔: \`= this.文笔评分\` 人设: \`= this.人设评分\`|
> | 笔记 | \`= this.笔记\`|
> | 精彩片段 | \`= this.精彩片段\` |
> | 进度 |\`= this.连载状态\` - \`= this.进度\` |
> | 书系 |\`= this.书系\`|
> | 官网 |\`= this.官网\`|
> | 版本 |\`= this.版本\`|
> | 相关 | \`= this.相关\` |

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------:|:----------------:| :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 记录

## 感想
`;

// 漫画作者自用模板
export const COMIC_TEMPLATE_AUTHOR = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
阅读状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
剧情评分: {{rating_story}}
画工评分: {{rating_drawing}}
人设评分: {{rating_character}}
标语:
单评: false
精彩片段:
笔记: "{{note_link}}"
版本:
格式:
Kindle: false
相关:
  -
渠道:
已购: false
作品大类: Comic
具体类型: "{{category}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
话数: "{{episode}}"
进度: "{{progress}}"
杂志: "{{journal}}"
作者: "[[{{author}}]]"{{#if staff}}
作画: "[[{{staff}}]]"{{/if}}
封面: "{{cover}}"
出版社: "{{publish}}"
---

> [!bangumi-info]+ 📚 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 标语 |\`= this.标语\`|
> | 状态 |\`= this.阅读状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 明细 | 剧情: \`= this.剧情评分\` 画工: \`= this.画工评分\` 人设: \`= this.人设评分\`|
> | 笔记 | \`= this.笔记\`|
> | 精彩片段 | \`= this.精彩片段\` |
> | 作者 |\`= this.作者\`|{{#if staff}}
> | 作画 |\`= this.作画\`|{{/if}}
> | 杂志 |\`= this.杂志\`|
> | 进度 |\`= this.进度\`|
> | 版本 | \`= this.版本\`|
> | 格式 | \`= this.格式\`|
> | 相关 | \`= this.相关\`|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------:|:----------------:| :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 记录

## 感想
`;

// 游戏作者自用模板
export const GAME_TEMPLATE_AUTHOR = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
游玩状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
剧情评分: {{rating_story}}
趣味评分: {{rating_fun}}
音乐评分: {{rating_music}}
美术评分: {{rating_art}}
标语:
单评: false
笔记: "{{note_link}}"
存储:
相关:
  -
作品大类: Game
具体类型: "{{category}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
平台:
开发: "{{develop}}"
发行: "{{publish}}"
发行日期: "{{date}}"
游玩人数: "{{playerNum}}"
官网: "{{website}}"
封面: "{{cover}}"
---

> [!bangumi-info]+ 🎮 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 标语 |\`= this.标语\`|
> | 状态 |\`= this.游玩状态\`|
> | 平台 |\`= this.平台\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 明细 |剧情: \`= this.剧情评分\` 趣味: \`= this.趣味评分\` 音乐: \`= this.音乐评分\` 美术: \`= this.美术评分\`|
> | 笔记 | \`= this.笔记\`|
> | 开发 | \`= this.开发\`|
> | 发行 | \`= this.发行\`|
> | 官网 | \`= this.官网\`|
> | 存储 | \`= this.存储\`|
> | 相关 | \`= this.相关\`|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------:|:----------------:| :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |

## 记录

## 感想
`;

// 画集作者自用模板
export const ALBUM_TEMPLATE_AUTHOR = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
作者: "[[{{author}}]]"
阅读状态: {{my_status}}
tags:
{{tags}}
评分: {{my_rate}}
单评: false
笔记: "{{note_link}}"
版本:
格式:
相关:
  -
已购: false
作品大类: Album
具体类型: "{{category}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
页数: "{{pages}}"
ISBN: "{{isbn}}"
封面: "{{cover}}"
发行日期: "{{date}}"
出版社: "{{publish}}"
---

> [!bangumi-info]+ 📖 **{{name}}**
>
> ![cover|400]({{cover}})
>
> | | |
> |:------:|:------------------------------------------:|
> | 作者 |\`= this.作者\`|
> | 状态 |\`= this.阅读状态\`|
> | 标签 |\`= this.tags\`|
> | 评分 |\`= this.评分\`|
> | 笔记 | \`= this.笔记\`|
> | 页数 |\`= this.页数\`|
> | ISBN |\`= this.ISBN\`|
> | 发行 |{{date}}|
> | 出版社 |{{publish}}|
> | 版本 |\`= this.版本\`|
> | 格式 | \`= this.格式\`|
> | 相关 | \`= this.相关\`|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]+ **简介**
> {{summary}}

## 记录

## 感想
`;

// 音乐作者自用模板（与标准模板相同）
export const MUSIC_TEMPLATE_AUTHOR = MUSIC_TEMPLATE_STANDARD;

// 三次元作者自用模板（与标准模板相同）
export const REAL_TEMPLATE_AUTHOR = REAL_TEMPLATE_STANDARD;

// ==================== 兼容旧版本的导出 ====================

// 保持向后兼容，默认使用作者自用模板
export const ANIME_TEMPLATE = ANIME_TEMPLATE_AUTHOR;
export const NOVEL_TEMPLATE = NOVEL_TEMPLATE_AUTHOR;
export const COMIC_TEMPLATE = COMIC_TEMPLATE_AUTHOR;
export const GAME_TEMPLATE = GAME_TEMPLATE_AUTHOR;
export const ALBUM_TEMPLATE = ALBUM_TEMPLATE_AUTHOR;
export const MUSIC_TEMPLATE = MUSIC_TEMPLATE_STANDARD;
export const REAL_TEMPLATE = REAL_TEMPLATE_STANDARD;

// ==================== 辅助函数 ====================

/**
 * 根据条目类型获取默认模板
 * @param subjectType 条目类型
 * @param category 细分类别
 * @param useAuthorTemplate 是否使用作者自用模板
 */
export function getDefaultTemplate(subjectType: number, category?: string, useAuthorTemplate: boolean = true): string {
	// 首先检查细分类别
	if (category) {
		if (category.includes('小说')) {
			return useAuthorTemplate ? NOVEL_TEMPLATE_AUTHOR : NOVEL_TEMPLATE_STANDARD;
		}
		if (category.includes('漫画')) {
			return useAuthorTemplate ? COMIC_TEMPLATE_AUTHOR : COMIC_TEMPLATE_STANDARD;
		}
		if (category.includes('画集') || category.includes('画本')) {
			return useAuthorTemplate ? ALBUM_TEMPLATE_AUTHOR : ALBUM_TEMPLATE_STANDARD;
		}
	}

	// 根据条目类型返回
	switch (subjectType) {
		case 1: // Book
			return useAuthorTemplate ? NOVEL_TEMPLATE_AUTHOR : NOVEL_TEMPLATE_STANDARD;
		case 2: // Anime
			return useAuthorTemplate ? ANIME_TEMPLATE_AUTHOR : ANIME_TEMPLATE_STANDARD;
		case 3: // Music
			return MUSIC_TEMPLATE_STANDARD;
		case 4: // Game
			return useAuthorTemplate ? GAME_TEMPLATE_AUTHOR : GAME_TEMPLATE_STANDARD;
		case 6: // Real
			return REAL_TEMPLATE_STANDARD;
		default:
			return useAuthorTemplate ? NOVEL_TEMPLATE_AUTHOR : NOVEL_TEMPLATE_STANDARD;
	}
}

/**
 * 获取作品大类标签
 */
export function getTypeLabel(subjectType: number, category?: string): string {
	// 首先检查细分类别
	if (category) {
		if (category.includes('小说')) {
			return 'Novel';
		}
		if (category.includes('漫画')) {
			return 'Comic';
		}
		if (category.includes('画集') || category.includes('画本')) {
			return 'Album';
		}
	}

	// 根据条目类型返回
	switch (subjectType) {
		case 1: // Book
			return 'Book';
		case 2: // Anime
			return 'Anime';
		case 3: // Music
			return 'Music';
		case 4: // Game
			return 'Game';
		case 6: // Real
			return 'Real';
		default:
			return 'Unknown';
	}
}
