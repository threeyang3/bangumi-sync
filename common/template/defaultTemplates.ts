/**
 * 默认模板定义
 * 基于用户现有的 Templater 模板改进
 * 评分、状态、短评等从 Bangumi 用户收藏自动获取
 */

// 动画模板
export const ANIME_TEMPLATE = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
观看状态: {{my_status}}
tags: {{tags}}
评分: {{my_rate}}
评分明细:
  - 音乐：{{rating_music}}
  - 人设：{{rating_character}}
  - 剧情：{{rating_story}}
  - 美术：{{rating_art}}
标语:
单评: false
精彩片段:
笔记: "[[收集箱/笔记/ACGN/《{{name_cn}}》笔记|《{{name_cn}}》笔记]]"
存储:
资源属性:
相关:
  -
作品大类: Anime
具体类型: "{{category}}"
封面: "![]({{cover}})"
开播时间: "{{year}} 年 {{month}} 月"
集数: "{{episode}}"
动画公司: "{{animeMake}}"
导演: "[[{{director}}]]"
音乐: "[[{{music}}]]"
官方网站: "{{website}}"
---

> [!bookinfo|noicon]+ 📺 **{{name}}**
> ![bookcover|400]({{cover}})
>
| 标语 |\`= this.标语\`|
|:------: |:------------------------------------------: |
| 状态 |\`= this.观看状态\`|
| 标签 |\`= this.tags\`|
| 评分 |\`= this.评分\`|
| 明细 |音乐: {{rating_music}} 人设: {{rating_character}} 剧情: {{rating_story}} 美术: {{rating_art}}|
| 笔记 | \`= this.笔记\`|
| 放送 | {{year}} 年 {{month}} 月 |
| 集数 | {{category}} 共{{episode}}话 |
| 制作 | {{animeMake}} |
| 导演 | {{director}} |
| 音乐 | {{music}} |
| 存储 | \`= this.存储\`·\`=this.资源属性\` |
| 相关 | \`= this.相关\` |


> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  {{character1}} | {{character2}}   |   {{character3}}  |
|:------: |:----------------: | :--------------- : |
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

// 小说模板
export const NOVEL_TEMPLATE = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
作者: "[[{{author}}]]"
插画: "[[{{illustration}}]]"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
连载状态: {{status}}
阅读状态: {{my_status}}
tags: {{tags}}
评分: {{my_rate}}
评分明细:
  - 剧情：{{rating_story}}
  - 插画：{{rating_illustration}}
  - 文笔：{{rating_writing}}
  - 人设：{{rating_character}}
标语:
单评: false
笔记: "[[收集箱/笔记/ACGN/《{{name_cn}}》笔记|《{{name_cn}}》笔记]]"
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
书系: "{{series}}"
进度: "{{progress}}"
册数: "{{volumes}}"
封面: "![]({{cover}})"
开始:
发行日期: "{{date}}"
出版社: "{{publish}}"
---

> [!bookinfo|noicon]+  📚 **{{name}}**
> ![bookcover|400]({{cover}})
>
| 标语 |\`= this.标语\`|
|:------: |:------------------------------------------: |
| 作者 |\`= this.作者\`|
| 插画 |\`= this.插画\`|
| 状态 |\`= this.阅读状态\`|
| 标签 |\`= this.tags\`|
| 评分 |\`= this.评分\`|
| 明细 | 剧情: {{rating_story}} 插画: {{rating_illustration}} 文笔: {{rating_writing}} 人设: {{rating_character}}|
| 笔记 | \`= this.笔记\`|
| 进度 |\`= this.连载状态\` - \`= this.进度\` |
| 书系 |\`= this.书系\`|
| 官网 |\`= this.官网\`|
| 版本 |\`= this.版本\`|
| 相关 | \`= this.相关\` |


> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------: |:----------------: | :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |
`;

// 漫画模板
export const COMIC_TEMPLATE = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
连载状态: "{{status}}"
阅读状态: {{my_status}}
tags: {{tags}}
评分: {{my_rate}}
评分明细:
  - 剧情：{{rating_story}}
  - 画工：{{rating_drawing}}
  - 人设：{{rating_character}}
标语:
单评: false
笔记: "[[收集箱/笔记/ACGN/《{{name_cn}}》笔记|《{{name_cn}}》笔记]]"
版本:
格式:
Kindle: false
相关:
  -
渠道:
已购: false
作品大类: Comic
具体类型: "{{category}}"
话数: "{{episode}}"
进度: "{{progress}}"
杂志: "{{journal}}"
作者: "[[{{author}}]]"{{#if staff}}
作画: "[[{{staff}}]]"{{/if}}
封面: "![]({{cover}})"
出版社: "{{publish}}"
---

> [!bookinfo|noicon]+  📚 **{{name}}**
> ![bookcover|400]({{cover}})
>
| 标语 |\`= this.标语\`|
|:------: |:------------------------------------------: |
| 状态 |\`= this.阅读状态\`|
| 标签 |\`= this.tags\`|
| 评分 |\`= this.评分\`|
| 明细 | 剧情: {{rating_story}} 画工: {{rating_drawing}} 人设: {{rating_character}}|
| 笔记 | \`= this.笔记\`|
| 作者 |\`= this.作者\` |{{#if staff}}
| 作画 |\`= this.作画\`|{{/if}}
| 杂志 |\`= this.杂志\`|
| 进度 |\`= this.连载状态\` - \`= this.进度\`|
| 版本 | \`= this.版本\`|
| 格式 | \`= this.格式\` |
| 相关 | \`= this.相关\` |


> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------: |:----------------: | :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |
`;

// 游戏模板
export const GAME_TEMPLATE = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
平台:
具体类型: "{{category}}"
游玩状态: {{my_status}}
tags: {{tags}}
评分: {{my_rate}}
评分明细:
  - 剧情：{{rating_story}}
  - 趣味：{{rating_fun}}
  - 音乐：{{rating_music}}
  - 美术：{{rating_art}}
标语:
单评: false
笔记: "[[收集箱/笔记/ACGN/《{{name_cn}}》笔记|《{{name_cn}}》ACGN笔记]]"
存储:
相关:
  -
作品大类: Game
开发: "{{develop}}"
发行: "{{publish}}"
发行日期: "{{date}}"
游玩人数: "{{playerNum}}"
官网: "{{website}}"
封面: "![]({{cover}})"
---

> [!bookinfo|noicon]+ 🎮 **{{name}}**
> ![bookcover|400]({{cover}})
>
| 标语 |\`= this.标语\`|
|:------: |:------------------------------------------: |
| 状态 |\`= this.游玩状态\`|
| 平台 |\`= this.平台\`|
| 标签 |\`= this.tags\`|
| 评分 |\`= this.评分\`|
| 明细 |剧情: {{rating_story}} 趣味: {{rating_fun}} 音乐: {{rating_music}} 美术: {{rating_art}} |
| 笔记 | \`= this.笔记\`|
| 开发 | \`= this.开发\` |
| 发行 | \`= this.发行\` |
| 官网 | \`= this.官网\` |
| 存储 | \`= this.存储\` |
| 相关 | \`= this.相关\` |


> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]- **简介**
> {{summary}}

> [!tip]- **主要角色**
>
|  **{{character1}}**| **{{character2}}**   |   **{{character3}}**  |
|:------: |:----------------: | :--------------- : |
|  {{characterPhoto1}} | {{characterPhoto2}}   |   {{characterPhoto3}}  |
| **{{character4}}**  |  **{{character5}}**  | **{{character6}}**  |
| {{characterPhoto4}}  |  {{characterPhoto5}}  | {{characterPhoto6}}  |
| **{{character7}}**  |  **{{character8}}**  | **{{character9}}**  |
| {{characterPhoto7}}  |  {{characterPhoto8}}  | {{characterPhoto9}}  |
`;

// 画集模板
export const ALBUM_TEMPLATE = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
作者: "[[{{author}}]]"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
阅读状态: {{my_status}}
tags: {{tags}}
评分: {{my_rate}}
单评: false
笔记: "[[收集箱/笔记/ACGN/《{{name_cn}}》笔记|《{{name_cn}}》笔记]]"
版本:
格式:
相关:
  -
已购: false
作品大类: Album
具体类型: "{{category}}"
页数: "{{pages}}"
ISBN: "{{isbn}}"
封面: "![]({{cover}})"
发行日期: "{{date}}"
出版社: "{{publish}}"
---

> [!bookinfo|noicon]+ 📖 **{{name}}**
> ![bookcover|400]({{cover}})
>
| 标语 |\`= this.标语\`|
|:------: |:------------------------------------------: |
| 作者 |\`= this.作者\`|
| 状态 |\`= this.阅读状态\`|
| 标签 |\`= this.tags\`|
| 评分 |\`= this.评分\`|
| 笔记 | \`= this.笔记\`|
| 页数 |\`= this.页数\`|
| ISBN |\`= this.ISBN\`|
| 发行 |{{date}}|
| 出版社 |{{publish}}|
| 版本 |\`= this.版本\`|
| 格式 | \`= this.格式\` |
| 相关 | \`= this.相关\` |


> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]+ **简介**
> {{summary}}
`;

// 音乐模板（基础版）
export const MUSIC_TEMPLATE = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
收藏状态: {{my_status}}
tags: {{tags}}
评分: {{my_rate}}
作品大类: Music
具体类型: "{{category}}"
封面: "![]({{cover}})"
发行日期: "{{date}}"
---

> [!bookinfo|noicon]+ 🎵 **{{name}}**
> ![bookcover|400]({{cover}})
>
| 标签 |\`= this.tags\`|
|:------: |:------------------------------------------: |
| 评分 |\`= this.评分\`|
| 发行 |{{date}}|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]+ **简介**
> {{summary}}
`;

// 三次元模板（基础版）
export const REAL_TEMPLATE = `---
id: {{id}}
中文名: "{{name_cn}}"
原名: "{{name}}"
别名: "{{alias}}"
Bangumi评分: "{{rating}}"
Bangumi链接: "{{bangumi_url}}"
观看状态: {{my_status}}
tags: {{tags}}
评分: {{my_rate}}
作品大类: Real
具体类型: "{{category}}"
封面: "![]({{cover}})"
上映日期: "{{date}}"
---

> [!bookinfo|noicon]+ 🎬 **{{name}}**
> ![bookcover|400]({{cover}})
>
| 标签 |\`= this.tags\`|
|:------: |:------------------------------------------: |
| 状态 |\`= this.观看状态\`|
| 评分 |\`= this.评分\`|
| 上映 |{{date}}|

> [!abstract]+ **短评**
> {{my_comment}}

> [!abstract]+ **简介**
> {{summary}}
`;

/**
 * 根据条目类型获取默认模板
 */
export function getDefaultTemplate(subjectType: number, category?: string): string {
	// 首先检查细分类别
	if (category) {
		if (category.includes('小说')) {
			return NOVEL_TEMPLATE;
		}
		if (category.includes('漫画')) {
			return COMIC_TEMPLATE;
		}
		if (category.includes('画集') || category.includes('画本')) {
			return ALBUM_TEMPLATE;
		}
	}

	// 根据条目类型返回
	switch (subjectType) {
		case 1: // Book
			return NOVEL_TEMPLATE; // 默认使用小说模板
		case 2: // Anime
			return ANIME_TEMPLATE;
		case 3: // Music
			return MUSIC_TEMPLATE;
		case 4: // Game
			return GAME_TEMPLATE;
		case 6: // Real
			return REAL_TEMPLATE;
		default:
			return NOVEL_TEMPLATE;
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
