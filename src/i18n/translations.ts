/**
 * 国际化支持
 * 符合 Obsidian 插件规范：默认英文，支持多语言
 */

import { moment } from 'obsidian';

export type Locale = 'en' | 'zh-CN';

/**
 * 翻译文本类型
 */
export interface TranslationStrings {
	// 命令
	commands: {
		openControlPanel: string;
		syncCollections: string;
		quickSync: string;
	};

	// Ribbon
	ribbon: {
		collectionManager: string;
	};

	// 通知
	notices: {
		configureTokenFirst: string;
		selectSubjectType: string;
		selectCollectionType: string;
		syncManagerNotInit: string;
		syncFailed: string;
		syncComplete: string;
		noItemsToSync: string;
		syncCancelled: string;
		templateFileNotFound: string;
		readTemplateFailed: string;
		selectTemplateFirst: string;
		copiedToCustom: string;
		templateFileSelected: string;
	};

	// 设置
	settings: {
		heading: string;
		authentication: string;
		accessToken: string;
		accessTokenDesc: string;
		enterAccessToken: string;
		pathSettings: string;
		filePathTemplate: string;
		filePathTemplateDesc: string;
		scanFolderPath: string;
		scanFolderPathDesc: string;
		downloadCoverImages: string;
		downloadCoverImagesDesc: string;
		imageQuality: string;
		imageQualityDesc: string;
		imageQualitySmall: string;
		imageQualityMedium: string;
		imageQualityLarge: string;
		updateExistingImages: string;
		updateExistingImagesDesc: string;
		coverLinkType: string;
		coverLinkTypeDesc: string;
		coverLinkNetwork: string;
		coverLinkLocal: string;
		imagePathTemplate: string;
		imagePathTemplateDesc: string;
		notePathTemplate: string;
		notePathTemplateDesc: string;
		templateSettings: string;
		templateVarTip: string;
		syncOptions: string;
		subjectTypesToSync: string;
		subjectTypesToSyncDesc: string;
		collectionTypesToSync: string;
		collectionTypesToSyncDesc: string;
		syncLimit: string;
		syncLimitDesc: string;
		autoSync: string;
		enableAutoSync: string;
		enableAutoSyncDesc: string;
		syncInterval: string;
		syncIntervalDesc: string;
			relatedLinks: string;
			enableRelatedLinks: string;
			enableRelatedLinksDesc: string;
		syncStatus: string;
		lastSync: string;
		notSyncedYet: string;
		defaultPropertyValues: string;
		defaultPropertyValuesDesc: string;
		anime: string;
		novel: string;
		comic: string;
		game: string;
		storage: string;
		resourceAttr: string;
		slogan: string;
		version: string;
		format: string;
		platform: string;
		kindle: string;
		saved: string;
		preview: string;
		standardTemplate: string;
		authorTemplate: string;
		fromFile: string;
		customContent: string;
		selectFile: string;
		edit: string;
		copy: string;
		copyTooltip: string;
		templateSourceStandard: string;
		templateSourceAuthor: string;
		templateSourceFile: string;
		templateSourceFileEmpty: string;
		templateSourceCustom: string;
		// 模板类型名称
		animeTemplate: string;
		novelTemplate: string;
		comicTemplate: string;
		gameTemplate: string;
		albumTemplate: string;
		musicTemplate: string;
		realTemplate: string;
	};

	// 同步选项弹窗
	syncOptions: {
		title: string;
		subjectTypes: string;
		collectionTypes: string;
		syncLimit: string;
		syncLimitDesc: string;
		forceSync: string;
		forceSyncDesc: string;
		selectAll: string;
		deselectAll: string;
		startSync: string;
		cancel: string;
	};

	// 同步预览弹窗
	syncPreview: {
		title: string;
		itemsToSync: string;
		ratingDetails: string;
		myRating: string;
		selectAll: string;
		deselectAll: string;
		invert: string;
		importAll: string;
		importSelected: string;
		importUnselected: string;
		cancel: string;
	};

	// 同步进度弹窗
	syncModal: {
		title: string;
		preparing: string;
		validatingToken: string;
		fetchingCollections: string;
		scanningLocal: string;
		computingDiff: string;
		processing: string;
		completed: string;
		error: string;
	};

	// 模板编辑器
	templateEditor: {
		editTemplate: string;
		templateVarTip: string;
		enterTemplate: string;
		save: string;
		cancel: string;
	};

	// 控制面板
	controlPanel: {
		title: string;
		refresh: string;
		syncSelected: string;
		forceSync: string;
		deleteSelected: string;
		batchEdit: string;
		syncComments: string;
		syncTags: string;
		undo: string;
		loading: string;
		noUndo: string;
		undoSuccess: string;
		undoFailed: string;
		noSyncedItems: string;
		noSyncedItemsComment: string;
		noSyncedItemsTag: string;
		selectFirst: string;
		confirmDelete: string;
		deleteConfirm: string;
		open: string;
		// 筛选
		allTypes: string;
		allStatus: string;
		allSyncStatus: string;
		synced: string;
		unsynced: string;
		searchPlaceholder: string;
		// 表格
		name: string;
		type: string;
		status: string;
		rating: string;
		comment: string;
		tags: string;
		sync: string;
		action: string;
		// 状态消息
		cachedDataLoaded: string;
		loadingCollections: string;
		fetchingCollections: string;
		scanningLocal: string;
		scanningFiles: string;
		loadComplete: string;
		loadFailed: string;
		syncingItems: string;
		syncComplete: string;
		syncFailed: string;
		syncError: string;
		comparingComments: string;
		comparingTags: string;
		noCommentDiff: string;
		noTagDiff: string;
		compareCommentFailed: string;
		compareTagFailed: string;
		deleteComplete: string;
		selectedCount: string;
		// 分页
		totalItems: string;
		prevPage: string;
		nextPage: string;
		// 其他
		fileNotFound: string;
		unknown: string;
		selectToDelete: string;
		selectToSync: string;
		alreadySynced: string;
		selectSyncedToEdit: string;
		selectSyncedToDelete: string;
		confirmDeleteMessage: string;
	};

	// 评分明细
	ratingFields: {
		music: string;
		character: string;
		story: string;
		art: string;
		illustration: string;
		writing: string;
		drawing: string;
		fun: string;
	};
}

/**
 * 英文翻译（默认）
 */
const en: TranslationStrings = {
	commands: {
		openControlPanel: 'Open collection manager',
		syncCollections: 'Sync Bangumi collections',
		quickSync: 'Quick sync (use default settings)',
	},

	ribbon: {
		collectionManager: 'Bangumi collection manager',
	},

	notices: {
		configureTokenFirst: 'Please configure Access Token in settings first',
		selectSubjectType: 'Please select at least one subject type',
		selectCollectionType: 'Please select at least one collection type',
		syncManagerNotInit: 'Sync manager not initialized',
		syncFailed: 'Sync failed',
		syncComplete: 'Sync complete',
		noItemsToSync: 'No items to sync',
		syncCancelled: 'Sync cancelled',
		templateFileNotFound: 'Template file not found',
		readTemplateFailed: 'Failed to read template file',
		selectTemplateFirst: 'Please select a template file first',
		copiedToCustom: 'Copied to custom content, ready to edit',
		templateFileSelected: 'Template file selected',
	},

	settings: {
		heading: 'Settings',
		authentication: 'Authentication',
		accessToken: 'Access token',
		accessTokenDesc: 'Generate Access Token at https://next.bgm.tv/demo/access-token',
		enterAccessToken: 'Enter Access token',
		pathSettings: 'Path settings',
		filePathTemplate: 'File path template',
		filePathTemplateDesc: 'Supported variables: {{type}}, {{category}}, {{name}}, {{name_cn}}, {{year}}, {{author}}, {{id}}',
		scanFolderPath: 'Scan folder path',
		scanFolderPathDesc: 'Folder path for detecting synced items (leave empty to use base path from file path template)',
		downloadCoverImages: 'Download cover images',
		downloadCoverImagesDesc: 'Download cover images to local storage',
		imageQuality: 'Image quality',
		imageQualityDesc: 'Select the quality of downloaded images',
		imageQualitySmall: 'Small',
		imageQualityMedium: 'Medium',
		imageQualityLarge: 'Large',
		updateExistingImages: 'Update existing images',
		updateExistingImagesDesc: 'Update existing cover images during sync',
		coverLinkType: 'Cover link type',
		coverLinkTypeDesc: 'Link type for cover property (local link requires "Download cover images" enabled)',
		coverLinkNetwork: 'Network URL',
		coverLinkLocal: 'Local path',
		imagePathTemplate: 'Image path template',
		imagePathTemplateDesc: 'Supported variables: {{id}}, {{name_cn}}, {{name}}, {{typeLabel}} (e.g., ACGN/assets/{{name_cn}}_{{typeLabel}}.jpg)',
		notePathTemplate: 'Note path template',
		notePathTemplateDesc: 'Base path for note links, format: [[path/《name_cn》note|《name_cn》note]]',
		templateSettings: 'Template settings',
		templateVarTip: 'Template variable tip: {{tags}} uses your own tags, empty if none',
		syncOptions: 'Sync options',
		subjectTypesToSync: 'Subject types to sync',
		subjectTypesToSyncDesc: 'Select subject types to sync',
		collectionTypesToSync: 'Collection types to sync',
		collectionTypesToSyncDesc: 'Select collection types to sync',
		syncLimit: 'Sync limit',
		syncLimitDesc: 'If unsynced count is less than limit, sync all unsynced items',
		autoSync: 'Auto sync',
		enableAutoSync: 'Enable auto sync',
		enableAutoSyncDesc: 'Automatically sync Bangumi collections periodically',
		syncInterval: 'Sync interval (minutes)',
		syncIntervalDesc: 'Time interval for auto sync',
			relatedLinks: 'Related links',
			enableRelatedLinks: 'Enable related links',
			enableRelatedLinksDesc: 'Automatically fetch related subjects and create bidirectional links during sync',
		syncStatus: 'Sync status',
		lastSync: 'Last sync',
		notSyncedYet: 'Not synced yet',
		defaultPropertyValues: 'Default property values',
		defaultPropertyValuesDesc: 'Auto-fill these properties during batch sync (leave empty to skip)',
		anime: 'Anime',
		novel: 'Novel',
		comic: 'Comic',
		game: 'Game',
		storage: 'Storage',
		resourceAttr: 'Resource attribute',
		slogan: 'Slogan',
		version: 'Version',
		format: 'Format',
		platform: 'Platform',
		kindle: 'Kindle',
		saved: 'Saved',
		preview: 'Preview',
		standardTemplate: 'Standard template',
		authorTemplate: 'Author template',
		fromFile: 'From file',
		customContent: 'Custom content',
		selectFile: 'Select file',
		edit: 'Edit',
		copy: 'Copy',
		copyTooltip: 'Copy current template to custom content',
		templateSourceStandard: 'Use standard template (Bangumi data only)',
		templateSourceAuthor: 'Use author template (with custom variables)',
		templateSourceFile: 'Using file',
		templateSourceFileEmpty: 'Please select a template file',
		templateSourceCustom: 'Use custom edited template content',
		animeTemplate: 'Anime template',
		novelTemplate: 'Novel template',
		comicTemplate: 'Comic template',
		gameTemplate: 'Game template',
		albumTemplate: 'Album template',
		musicTemplate: 'Music template',
		realTemplate: 'Real template',
	},

	syncOptions: {
		title: 'Sync options',
		subjectTypes: 'Subject types',
		collectionTypes: 'Collection types',
		syncLimit: 'Sync limit',
		syncLimitDesc: 'If unsynced count is less than limit, sync all unsynced items',
		forceSync: 'Force sync',
		forceSyncDesc: 'Ignore existing items and re-sync all selected items',
		selectAll: 'Select all',
		deselectAll: 'Deselect all',
		startSync: 'Start sync',
		cancel: 'Cancel',
	},

	syncPreview: {
		title: 'Sync preview',
		itemsToSync: 'items to sync. Confirm items and fill in rating details.',
		ratingDetails: 'Rating details',
		myRating: 'My rating',
		selectAll: 'Select all',
		deselectAll: 'Deselect all',
		invert: 'Invert',
		importAll: 'Import all',
		importSelected: 'Import selected',
		importUnselected: 'Import unselected',
		cancel: 'Cancel',
	},

	syncModal: {
		title: 'Sync Bangumi collections',
		preparing: 'Preparing...',
		validatingToken: 'Validating Access token...',
		fetchingCollections: 'Fetching collections...',
		scanningLocal: 'Scanning local folder...',
		computingDiff: 'Computing sync diff...',
		processing: 'Processing...',
		completed: 'Completed',
		error: 'Error',
	},

	templateEditor: {
		editTemplate: 'Edit template',
		templateVarTip: 'Template variable tip: {{tags}} uses your own tags, empty if none',
		enterTemplate: 'Enter template content...',
		save: 'Save',
		cancel: 'Cancel',
	},

	controlPanel: {
		title: 'Bangumi collection manager',
		refresh: 'Refresh',
		syncSelected: 'Sync selected',
		forceSync: 'Force sync',
		deleteSelected: 'Delete selected',
		batchEdit: 'Batch edit',
		syncComments: 'Sync comments',
		syncTags: 'Sync tags',
		undo: 'Undo',
		loading: 'Loading...',
		noUndo: 'No operation to undo',
		undoSuccess: 'Undo successful',
		undoFailed: 'Undo failed',
		noSyncedItems: 'No synced items',
		noSyncedItemsComment: 'No synced items to compare comments',
		noSyncedItemsTag: 'No synced items to compare tags',
		selectFirst: 'Please select items first',
		confirmDelete: 'Confirm delete',
		deleteConfirm: 'Move selected files to trash?',
		open: 'Open',
		allTypes: 'All types',
		allStatus: 'All status',
		allSyncStatus: 'All sync status',
		synced: 'Synced',
		unsynced: 'Unsynced',
		searchPlaceholder: 'Search by name...',
		name: 'Name',
		type: 'Type',
		status: 'Status',
		rating: 'Rating',
		comment: 'Comment',
		tags: 'Tags',
		sync: 'Sync',
		action: 'Action',
		cachedDataLoaded: 'Loaded cached data, total',
		loadingCollections: 'Loading collections...',
		fetchingCollections: 'Fetching collections...',
		scanningLocal: 'Scanning local folder...',
		scanningFiles: 'Scanning local files...',
		loadComplete: 'Load complete',
		loadFailed: 'Load failed',
		syncingItems: 'Syncing items...',
		syncComplete: 'Sync complete',
		syncFailed: 'Sync failed',
		syncError: 'Sync error',
		comparingComments: 'Comparing comments...',
		comparingTags: 'Comparing tags...',
		noCommentDiff: 'No comment differences',
		noTagDiff: 'No tag differences',
		compareCommentFailed: 'Compare comments failed',
		compareTagFailed: 'Compare tags failed',
		deleteComplete: 'Delete complete',
		selectedCount: 'Selected',
		totalItems: 'Total',
		prevPage: 'Previous',
		nextPage: 'Next',
		fileNotFound: 'File not found',
		unknown: 'Unknown',
		selectToDelete: 'Please select items to delete',
		selectToSync: 'Please select items to sync',
		alreadySynced: 'Selected items are already synced',
		selectSyncedToEdit: 'Please select synced items to edit',
		selectSyncedToDelete: 'Selected items are not synced, cannot delete',
		confirmDeleteMessage: 'Delete selected local files? This will move them to trash.',
	},

	ratingFields: {
		music: 'Music',
		character: 'Character',
		story: 'Story',
		art: 'Art',
		illustration: 'Illustration',
		writing: 'Writing',
		drawing: 'Drawing',
		fun: 'Fun',
	},
};

/**
 * 中文翻译
 */
const zhCN: TranslationStrings = {
	commands: {
		openControlPanel: '打开收藏管理面板',
		syncCollections: '同步 Bangumi 收藏',
		quickSync: '快速同步（使用默认设置）',
	},

	ribbon: {
		collectionManager: 'Bangumi 收藏管理',
	},

	notices: {
		configureTokenFirst: '请先在设置中配置 Access Token',
		selectSubjectType: '请至少选择一种条目类型',
		selectCollectionType: '请至少选择一种收藏状态',
		syncManagerNotInit: '同步管理器未初始化',
		syncFailed: '同步失败',
		syncComplete: '同步完成',
		noItemsToSync: '没有需要同步的条目',
		syncCancelled: '已取消同步',
		templateFileNotFound: '模板文件不存在',
		readTemplateFailed: '读取模板文件失败',
		selectTemplateFirst: '请先选择模板文件',
		copiedToCustom: '已复制到自定义内容，可以开始编辑',
		templateFileSelected: '已选择模板文件',
	},

	settings: {
		heading: '设置',
		authentication: '认证设置',
		accessToken: 'Access Token',
		accessTokenDesc: '在 https://next.bgm.tv/demo/access-token 生成 Access Token',
		enterAccessToken: '输入 Access Token',
		pathSettings: '路径设置',
		filePathTemplate: '文件路径模板',
		filePathTemplateDesc: '支持变量: {{type}}, {{category}}, {{name}}, {{name_cn}}, {{year}}, {{author}}, {{id}}',
		scanFolderPath: '扫描文件夹路径',
		scanFolderPathDesc: '用于检测已同步条目的文件夹路径（留空则使用文件路径模板的基础路径）',
		downloadCoverImages: '下载封面图片',
		downloadCoverImagesDesc: '是否下载条目封面到本地',
		imageQuality: '图片质量',
		imageQualityDesc: '选择下载的图片质量',
		imageQualitySmall: '小',
		imageQualityMedium: '中',
		imageQualityLarge: '大',
		updateExistingImages: '更新已存在的图片',
		updateExistingImagesDesc: '同步时是否更新已存在的封面图片',
		coverLinkType: '封面链接类型',
		coverLinkTypeDesc: '选择封面属性使用的链接类型（需开启"下载封面图片"才能使用本地链接）',
		coverLinkNetwork: '网络链接',
		coverLinkLocal: '本地链接',
		imagePathTemplate: '图片路径模板',
		imagePathTemplateDesc: '支持变量: {{id}}, {{name_cn}}, {{name}}, {{typeLabel}} (如: ACGN/assets/{{name_cn}}_{{typeLabel}}.jpg)',
		notePathTemplate: '笔记路径模板',
		notePathTemplateDesc: '笔记链接的基础路径，生成格式: [[路径/《中文名》笔记|《中文名》笔记]]',
		templateSettings: '模板设置',
		templateVarTip: '模板变量提示：{{tags}} 使用用户自己的标签，如果没有则留空',
		syncOptions: '同步选项',
		subjectTypesToSync: '同步的条目类型',
		subjectTypesToSyncDesc: '选择要同步的条目类型',
		collectionTypesToSync: '同步的收藏类型',
		collectionTypesToSyncDesc: '选择要同步的收藏状态',
		syncLimit: '同步数量限制',
		syncLimitDesc: '每次同步的最大条目数量（0 表示不限制，会智能处理：如果未同步数量不够，同步所有未同步的）',
		autoSync: '自动同步',
		enableAutoSync: '启用自动同步',
		enableAutoSyncDesc: '定期自动同步 Bangumi 收藏',
		syncInterval: '同步间隔（分钟）',
		syncIntervalDesc: '自动同步的时间间隔',
			relatedLinks: '相关条目链接',
			enableRelatedLinks: '启用相关条目链接',
			enableRelatedLinksDesc: '同步时自动获取相关条目并建立双向链接',
		syncStatus: '同步状态',
		lastSync: '上次同步',
		notSyncedYet: '尚未同步',
		defaultPropertyValues: '默认属性值',
		defaultPropertyValuesDesc: '批量同步时，自动填充这些属性的默认值（留空则不填充）',
		anime: '动画',
		novel: '小说',
		comic: '漫画',
		game: '游戏',
		storage: '存储',
		resourceAttr: '资源属性',
		slogan: '标语',
		version: '版本',
		format: '格式',
		platform: '平台',
		kindle: 'Kindle',
		saved: '保存',
		preview: '预览',
		standardTemplate: '标准模板',
		authorTemplate: '作者自用模板',
		fromFile: '从文件选择',
		customContent: '自定义内容',
		selectFile: '选择文件',
		edit: '编辑',
		copy: '复制',
		copyTooltip: '复制当前模板到自定义内容',
		templateSourceStandard: '使用标准模板（只含 Bangumi 数据）',
		templateSourceAuthor: '使用作者自用模板（含自定义变量）',
		templateSourceFile: '使用文件',
		templateSourceFileEmpty: '请选择模板文件',
		templateSourceCustom: '使用自定义编辑的模板内容',
		animeTemplate: '动画模板',
		novelTemplate: '小说模板',
		comicTemplate: '漫画模板',
		gameTemplate: '游戏模板',
		albumTemplate: '画集模板',
		musicTemplate: '音乐模板',
		realTemplate: '三次元模板',
	},

	syncOptions: {
		title: '同步选项',
		subjectTypes: '条目类型',
		collectionTypes: '收藏状态',
		syncLimit: '同步数量',
		syncLimitDesc: '如果未同步数量不够，同步所有未同步的条目',
		forceSync: '强制同步',
		forceSyncDesc: '忽略已存在的条目，重新同步所有选中的条目',
		selectAll: '全选',
		deselectAll: '全不选',
		startSync: '开始同步',
		cancel: '取消',
	},

	syncPreview: {
		title: '同步预览',
		itemsToSync: '个条目待同步，请确认要导入的条目并填写评分明细',
		ratingDetails: '评分明细',
		myRating: '我的评分',
		selectAll: '全选',
		deselectAll: '全不选',
		invert: '反选',
		importAll: '全部导入',
		importSelected: '只导入选中的',
		importUnselected: '只导入未选中的',
		cancel: '取消',
	},

	syncModal: {
		title: '同步 Bangumi 收藏',
		preparing: '准备中...',
		validatingToken: '验证 Access Token...',
		fetchingCollections: '获取收藏列表...',
		scanningLocal: '扫描本地文件夹...',
		computingDiff: '计算同步差异...',
		processing: '处理中...',
		completed: '完成',
		error: '错误',
	},

	templateEditor: {
		editTemplate: '编辑模板',
		templateVarTip: '模板变量提示：{{tags}} 使用用户自己的标签，如果没有则留空',
		enterTemplate: '输入模板内容...',
		save: '保存',
		cancel: '取消',
	},

	controlPanel: {
		title: 'Bangumi 收藏管理面板',
		refresh: '刷新',
		syncSelected: '同步选中',
		forceSync: '强制同步',
		deleteSelected: '删除选中',
		batchEdit: '批量编辑',
		syncComments: '同步短评',
		syncTags: '同步标签',
		undo: '撤销',
		loading: '加载中...',
		noUndo: '没有可撤销的操作',
		undoSuccess: '撤销成功',
		undoFailed: '撤销失败',
		noSyncedItems: '没有已同步的条目',
		noSyncedItemsComment: '没有已同步的条目，无法对比短评',
		noSyncedItemsTag: '没有已同步的条目，无法对比标签',
		selectFirst: '请先选择条目',
		confirmDelete: '确认删除',
		deleteConfirm: '将选中的文件移动到回收站？',
		open: '打开',
		allTypes: '全部类型',
		allStatus: '全部状态',
		allSyncStatus: '全部同步状态',
		synced: '已同步',
		unsynced: '未同步',
		searchPlaceholder: '搜索条目名称...',
		name: '名称',
		type: '类型',
		status: '状态',
		rating: '评分',
		comment: '短评',
		tags: '标签',
		sync: '同步',
		action: '操作',
		cachedDataLoaded: '已加载缓存数据，共',
		loadingCollections: '正在加载收藏数据...',
		fetchingCollections: '正在获取收藏列表...',
		scanningLocal: '正在扫描本地文件夹...',
		scanningFiles: '正在扫描本地文件...',
		loadComplete: '加载完成',
		loadFailed: '加载失败',
		syncingItems: '正在同步条目...',
		syncComplete: '同步完成',
		syncFailed: '同步失败',
		syncError: '同步出错',
		comparingComments: '正在对比短评差异...',
		comparingTags: '正在对比标签差异...',
		noCommentDiff: '没有短评差异',
		noTagDiff: '没有标签差异',
		compareCommentFailed: '对比短评失败',
		compareTagFailed: '对比标签失败',
		deleteComplete: '删除完成',
		selectedCount: '已选',
		totalItems: '共',
		prevPage: '上一页',
		nextPage: '下一页',
		fileNotFound: '文件不存在',
		unknown: '未知',
		selectToDelete: '请先选择要删除的条目',
		selectToSync: '请先选择要同步的条目',
		alreadySynced: '选中的条目都已同步',
		selectSyncedToEdit: '请先选择已同步的条目进行编辑',
		selectSyncedToDelete: '选中的条目都未同步，无法删除',
		confirmDeleteMessage: '确定要删除选中的本地文件吗？此操作将移动到系统回收站。',
	},

	ratingFields: {
		music: '音乐',
		character: '人设',
		story: '剧情',
		art: '美术',
		illustration: '插画',
		writing: '文笔',
		drawing: '画工',
		fun: '趣味',
	},
};

const translations: Record<Locale, TranslationStrings> = {
	'en': en,
	'zh-CN': zhCN,
};

/**
 * 获取当前语言环境
 */
export function getLocale(): Locale {
	// 使用 moment 获取 Obsidian 的语言设置
	const locale = moment.locale();
	if (locale.startsWith('zh')) {
		return 'zh-CN';
	}
	return 'en';
}

/**
 * 获取翻译文本
 */
export function getTranslations(): TranslationStrings {
	const locale = getLocale();
	return translations[locale] || translations['en'];
}

/**
 * 翻译函数
 */
export function t<K extends keyof TranslationStrings>(
	category: K
): TranslationStrings[K] {
	return getTranslations()[category];
}

/**
 * 嵌套翻译函数
 */
export function tn<K extends keyof TranslationStrings, SK extends keyof TranslationStrings[K]>(
	category: K,
	subkey: SK
): TranslationStrings[K][SK] {
	return getTranslations()[category][subkey];
}
