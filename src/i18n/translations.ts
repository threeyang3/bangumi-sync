/**
 * 国际化支持
 * 符合 Obsidian 插件规范：默认英文，支持多语言
 */

import { getLanguage } from 'obsidian';

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
		exportUserData: string;
		importUserData: string;
		searchSubjects: string;
		checkAndSyncStatus: string;
		createSubjectNote: string;
		batchDownloadCovers: string;
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
		tokenInvalid: string;
		usernameNotFound: string;
		templateFileNotFound: string;
		readTemplateFailed: string;
		selectTemplateFirst: string;
		copiedToCustom: string;
		templateFileSelected: string;
		exportTemplatesSuccess: string;
		exportTemplatesFailed: string;
		selectExportFolder: string;
		templateReadFailed: string;
		noteManagerNotInit: string;
		coverDownloadComplete: string;
		coverDownloadDisabled: string;
		coverDownloadNoItems: string;
	};

	// 设置
	settings: {
		heading: string;
		helpLinks: string;
		templateGuide: string;
		githubRepo: string;
		getAccessToken: string;
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
		noteTemplateContent: string;
		noteTemplateContentDesc: string;
		templateSettings: string;
		templateVarTip: string;
		syncOptions: string;
		subjectTypesToSync: string;
		subjectTypesToSyncDesc: string;
		collectionTypesToSync: string;
		collectionTypesToSyncDesc: string;
		syncLimit: string;
		syncLimitDesc: string;
		syncConcurrency: string;
		syncConcurrencyDesc: string;
		syncAll: string;
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
		preview: string;
		standardTemplate: string;
		authorTemplate: string;
		fromFile: string;
		customContent: string;
		selectFile: string;
		edit: string;
		copy: string;
		copyTooltip: string;
		exportTemplates: string;
		exportTemplatesDesc: string;
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
		// 数据保护设置
		dataProtection: string;
		dataProtectionDesc: string;
		preserveRatingDetails: string;
		preserveRatingDetailsDesc: string;
		preserveCustomProperties: string;
		preserveCustomPropertiesDesc: string;
		preserveRecord: string;
		preserveRecordDesc: string;
		preserveThoughts: string;
		preserveThoughtsDesc: string;
	};

	// 同步选项弹窗
	syncOptions: {
		title: string;
		subjectTypes: string;
		collectionTypes: string;
		syncLimit: string;
		syncLimitDesc: string;
		syncAll: string;
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
		pause: string;
		resume: string;
		cancel: string;
		confirmCancel: string;
		paused: string;
		syncing: string;
		rollback: string;
		rollbackComplete: string;
		rollbackFailed: string;
		completedStats: string;
		errorDetails: string;
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
		syncStatus: string;
		comparingStatus: string;
		noStatusDiff: string;
		compareStatusFailed: string;
		undo: string;
		loading: string;
		noUndo: string;
		undoSuccess: string;
		undoFailed: string;
		noSyncedItems: string;
		noSyncedItemsComment: string;
		noSyncedItemsTag: string;
		noSyncedItemsStatus: string;
		selectFirst: string;
		confirmDelete: string;
		deleteConfirm: string;
		open: string;
		note: string;
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
		localPropertyTitle: string;
		localPropertyDesc: string;
		localPropertySkip: string;
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

	// 用户数据
	userData: {
		exportTitle: string;
		exportDesc: string;
		importTitle: string;
		importDesc: string;
		scanFolder: string;
		scanFolderDesc: string;
		outputDir: string;
		outputDirDesc: string;
		export: string;
		import: string;
		cancel: string;
		exportSuccess: string;
		exportFailed: string;
		importSuccess: string;
		importSkipped: string;
		importErrors: string;
		importFailed: string;
		missingFieldTitle: string;
		missingFieldDesc: string;
		addAll: string;
		skipAll: string;
		addField: string;
		skipField: string;
		confirm: string;
		importResultTitle: string;
		missingFieldPrompt: string;
		handleMissingFields: string;
		skipMissingFields: string;
		close: string;
		missingFieldsApplied: string;
	};

	// 状态同步弹窗
	statusSyncModal: {
		title: string;
		description: string;
		subjectName: string;
		diffFields: string;
		action: string;
		expand: string;
		collapse: string;
		field: string;
		local: string;
		cloud: string;
		decision: string;
		fieldRate: string;
		fieldComment: string;
		fieldTags: string;
		fieldStatus: string;
		fieldEpisodeStatus: string;
		empty: string;
		keepLocal: string;
		keepCloud: string;
		merge: string;
		skip: string;
		noDiff: string;
		allLocal: string;
		allCloud: string;
		allSkip: string;
		smartMerge: string;
		execute: string;
		cancel: string;
		syncProgress: string;
		syncComplete: string;
		syncFailed: string;
	};

	// 搜索弹窗
	searchModal: {
		title: string;
		searchPlaceholder: string;
		search: string;
		clear: string;
		subjectType: string;
		sortBy: string;
		sort_match: string;
		sort_heat: string;
		sort_rank: string;
		sort_score: string;
		searching: string;
		resultsCount: string;
		searchFailed: string;
		loadMore: string;
		addToCollection: string;
		editCollection: string;
		addedSuccess: string;
		noResults: string;
		synced: string;
		notCollected: string;
	};

	// 添加到收藏弹窗
	addToCollection: {
		title: string;
		bangumiProperties: string;
		collectionType: string;
		rating: string;
		tags: string;
		tagsPlaceholder: string;
		comment: string;
		commentPlaceholder: string;
		ratingDetails: string;
		syncOptions: string;
		syncToCloud: string;
		createLocal: string;
		confirm: string;
		cancel: string;
		addError: string;
	};

	// 批量编辑器
	batchEditor: {
		title: string;
		info: string;
		typeAdd: string;
		typeModify: string;
		typeDelete: string;
		propertyName: string;
		propertyValue: string;
		addOperation: string;
		execute: string;
		cancel: string;
		emptyOperations: string;
		noticeProperty: string;
		noticeValue: string;
		noticeNoOp: string;
		removeOperation: string;
	};

	// 短评同步
	commentSync: {
		title: string;
		description: string;
		allLocal: string;
		allCloud: string;
		allSkip: string;
		name: string;
		localComment: string;
		cloudComment: string;
		decision: string;
		skipLabel: string;
		keepLocal: string;
		keepCloud: string;
		empty: string;
		execute: string;
		cancel: string;
		progress: string;
		complete: string;
		noSelection: string;
		failed: string;
	};

	// 标签同步
	tagSync: {
		title: string;
		description: string;
		allLocal: string;
		allCloud: string;
		allMerge: string;
		allSkip: string;
		name: string;
		localTags: string;
		cloudTags: string;
		decision: string;
		skipLabel: string;
		keepLocal: string;
		keepCloud: string;
		merge: string;
		empty: string;
		execute: string;
		cancel: string;
		progress: string;
		complete: string;
		noSelection: string;
		failed: string;
	};

	// 条目类型
	subjectTypes: {
		all: string;
		anime: string;
		game: string;
		book: string;
		music: string;
		real: string;
	};

	// 收藏类型
	collectionTypes: {
		wish: string;
		done: string;
		doing: string;
		onHold: string;
		dropped: string;
	};

	// 集数右键菜单
	episodeContextMenu: {
		openAnimeFileFirst: string;
		cannotIdentifyId: string;
		watchedUpTo: string;
		markAsWatched: string;
		markAsWish: string;
		markAsDropped: string;
		unmark: string;
		addComment: string;
		episodeStatusSet: string;
		markFailed: string;
		markedEpisodes: string;
		episodeCommentAdded: string;
		addCommentFailed: string;
	};

	// 条目笔记管理
	subjectNote: {
		notSyncedFile: string;
		configureNotePath: string;
		missingSubjectId: string;
		appendedToNote: string;
		createdNote: string;
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
		exportUserData: 'Export user data',
		importUserData: 'Import user data',
		searchSubjects: 'Search and add subjects',
		checkAndSyncStatus: 'Check and sync status',
		createSubjectNote: 'Create or append subject note',
		batchDownloadCovers: 'Batch download cover images',
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
		tokenInvalid: 'Access Token invalid: {error}',
		usernameNotFound: 'Unable to get username, please check Access Token',
		templateFileNotFound: 'Template file not found',
		readTemplateFailed: 'Failed to read template file',
		selectTemplateFirst: 'Please select a template file first',
		copiedToCustom: 'Copied to custom content, ready to edit',
		templateFileSelected: 'Template file selected',
		exportTemplatesSuccess: 'Templates exported successfully',
		exportTemplatesFailed: 'Failed to export templates',
		selectExportFolder: 'Please select a folder to export templates',
		templateReadFailed: 'Failed to read template file: {path}',
		noteManagerNotInit: 'Subject note manager not initialized',
		coverDownloadComplete: 'Cover download complete: {downloaded} downloaded, {skipped} skipped, {failed} failed',
		coverDownloadDisabled: 'Please enable "Download cover images" in settings first',
		coverDownloadNoItems: 'No items with network cover links found',
	},

	settings: {
		heading: 'Settings',
		helpLinks: 'Help & Documentation',
		templateGuide: 'Template Guide',
		githubRepo: 'GitHub Repository',
		getAccessToken: 'Get Access Token',
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
		notePathTemplateDesc: 'Full shared note file path template. Example: 收集箱/笔记/ACGN/{{name_cn}}.md',
		noteTemplateContent: 'Note template content',
		noteTemplateContentDesc: 'Template used when creating a new shared note file. Supported variables: {{id_yaml}}, {{primary_id}}, {{name}}, {{name_cn}}, {{entry_heading}}',
		templateSettings: 'Template settings',
		templateVarTip: 'Template variable tip: {{tags}} uses your own tags, empty if none',
		syncOptions: 'Sync options',
		subjectTypesToSync: 'Subject types to sync',
		subjectTypesToSyncDesc: 'Select subject types to sync',
		collectionTypesToSync: 'Collection types to sync',
		collectionTypesToSyncDesc: 'Select collection types to sync',
		syncLimit: 'Sync limit',
		syncLimitDesc: 'If unsynced count is less than limit, sync all unsynced items',
		syncConcurrency: 'Sync concurrency',
		syncConcurrencyDesc: 'Number of items to sync simultaneously (1-5)',
		syncAll: 'All',
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
		preview: 'Preview',
		standardTemplate: 'Standard template',
		authorTemplate: 'Author template',
		fromFile: 'From file',
		customContent: 'Custom content',
		selectFile: 'Select file',
		edit: 'Edit',
		copy: 'Copy',
		copyTooltip: 'Copy current template to custom content',
		exportTemplates: 'Export all templates',
		exportTemplatesDesc: 'Save all current templates to a folder',
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
		dataProtection: 'Data protection',
		dataProtectionDesc: 'Settings for protecting user data during force sync',
		preserveRatingDetails: 'Preserve rating details',
		preserveRatingDetailsDesc: 'Keep custom score-detail fields when force syncing',
		preserveCustomProperties: 'Preserve custom properties',
		preserveCustomPropertiesDesc: 'Keep custom frontmatter properties when force syncing',
		preserveRecord: 'Preserve records',
		preserveRecordDesc: 'Keep the Record section content when force syncing',
		preserveThoughts: 'Preserve thoughts',
		preserveThoughtsDesc: 'Keep the Thoughts section content when force syncing',
	},

	syncOptions: {
		title: 'Sync options',
		subjectTypes: 'Subject types',
		collectionTypes: 'Collection types',
		syncLimit: 'Sync limit',
		syncLimitDesc: 'If unsynced count is less than limit, sync all unsynced items',
		syncAll: 'All',
		forceSync: 'Force sync',
		forceSyncDesc: 'Ignore existing items and re-sync all selected items',
		selectAll: 'Select all',
		deselectAll: 'Deselect all',
		startSync: 'Start sync',
		cancel: 'Cancel',
	},

	syncPreview: {
		title: 'Sync preview',
		itemsToSync: 'items to sync. Confirm which items should be imported.',
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
		pause: 'Pause',
		resume: 'Resume',
		cancel: 'Cancel',
		confirmCancel: 'Are you sure you want to cancel? Newly created files will be moved to trash.',
		paused: 'Paused',
		syncing: 'Syncing',
		rollback: 'Rollback',
		rollbackComplete: 'Rollback complete: {deleted} deleted, {failed} failed',
		rollbackFailed: 'Rollback failed',
		completedStats: 'Added: {added}, Skipped: {skipped}, Errors: {errors}',
		errorDetails: 'Error details',
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
		syncStatus: 'Sync status',
		comparingStatus: 'Comparing status...',
		noStatusDiff: 'No status differences',
		compareStatusFailed: 'Compare status failed',
		undo: 'Undo',
		loading: 'Loading...',
		noUndo: 'No operation to undo',
		undoSuccess: 'Undo successful',
		undoFailed: 'Undo failed',
		noSyncedItems: 'No synced items',
		noSyncedItemsComment: 'No synced items to compare comments',
		noSyncedItemsTag: 'No synced items to compare tags',
		noSyncedItemsStatus: 'No synced items to compare status',
		selectFirst: 'Please select items first',
		confirmDelete: 'Confirm delete',
		deleteConfirm: 'Move selected files to trash?',
		open: 'Open',
		note: 'Note',
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
		localPropertyTitle: 'Local custom properties',
		localPropertyDesc: 'Fields here are discovered from the current template frontmatter. The plugin first collects all frontmatter properties, then filters out auto-filled Bangumi fields. Any remaining local-only field, including score-detail properties, can be filled here.',
		localPropertySkip: 'Skip',
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

	userData: {
		exportTitle: 'Export user data',
		exportDesc: 'Export local user data in three parts: identifier fields, custom properties, and the Record/Thoughts section content.',
		importTitle: 'Import user data',
		importDesc: 'Import user data from backup files. Missing fields will be highlighted for your decision.',
		scanFolder: 'Scan folder',
		scanFolderDesc: 'Folder to scan for user data',
		outputDir: 'Output directory',
		outputDirDesc: 'Directory to save export files',
		export: 'Export',
		import: 'Import',
		cancel: 'Cancel',
		exportSuccess: 'Exported {count} files',
		exportFailed: 'Export failed: {error}',
		importSuccess: 'Imported {count} items',
		importSkipped: 'Skipped {count} items',
		importErrors: '{count} errors',
		importFailed: 'Import failed: {error}',
		missingFieldTitle: 'Missing fields detected',
		missingFieldDesc: 'Some fields from import file do not exist in current templates. Choose whether to add them.',
		addAll: 'Add all',
		skipAll: 'Skip all',
		addField: 'Add',
		skipField: 'Skip',
		confirm: 'Confirm',
		importResultTitle: 'Import result',
		missingFieldPrompt: '{count} missing fields need your decision',
		handleMissingFields: 'Handle missing fields',
		skipMissingFields: 'Skip missing fields',
		close: 'Close',
		missingFieldsApplied: 'Applied {count} missing fields',
		},

		statusSyncModal: {
			title: 'Status sync',
			description: 'Found {count} items with differences. Select which version to keep for each field.',
			subjectName: 'Subject',
			diffFields: 'Diff fields',
			action: 'Action',
			expand: 'Expand',
			collapse: 'Collapse',
			field: 'Field',
			local: 'Local',
			cloud: 'Cloud',
			decision: 'Decision',
			fieldRate: 'Rating',
			fieldComment: 'Comment',
			fieldTags: 'Tags',
			fieldStatus: 'Status',
			fieldEpisodeStatus: 'Episode status',
			empty: '(empty)',
			keepLocal: 'Keep local',
			keepCloud: 'Keep cloud',
			merge: 'Merge',
			skip: 'Skip',
			noDiff: 'No differences',
			allLocal: 'All local',
			allCloud: 'All cloud',
			allSkip: 'All skip',
			smartMerge: 'Smart merge',
			execute: 'Execute sync',
			cancel: 'Cancel',
			syncProgress: 'Syncing...',
			syncComplete: 'Sync complete: {success} succeeded, {failed} failed',
			syncFailed: 'Sync failed, please check network connection',
		},

	searchModal: {
		title: 'Search subjects',
		searchPlaceholder: 'Enter keyword to search...',
		search: 'Search',
		clear: 'Clear',
		subjectType: 'Type',
		sortBy: 'Sort by',
		sort_match: 'Match',
		sort_heat: 'Heat',
		sort_rank: 'Rank',
		sort_score: 'Score',
		searching: 'Searching...',
		resultsCount: 'Found {total} results, showing {count}',
		searchFailed: 'Search failed',
		loadMore: 'Load more',
		addToCollection: 'Add',
		editCollection: 'Edit',
		addedSuccess: 'Added {name} successfully',
		noResults: 'No results found',
		synced: 'Synced',
		notCollected: 'Not collected',
	},

	addToCollection: {
		title: 'Add to collection',
		bangumiProperties: 'Bangumi properties',
		collectionType: 'Collection status',
		rating: 'Rating',
		tags: 'Tags',
		tagsPlaceholder: 'Enter tag and press Enter',
		comment: 'Comment',
		commentPlaceholder: 'Write your comment...',
		ratingDetails: 'Rating details',
		syncOptions: 'Sync options',
		syncToCloud: 'Sync to Bangumi cloud',
		createLocal: 'Create local file',
		confirm: 'Confirm',
		cancel: 'Cancel',
		addError: 'Failed to add',
	},

	batchEditor: {
		title: 'Batch edit properties',
		info: 'Editing {count} files',
		typeAdd: 'Add',
		typeModify: 'Modify',
		typeDelete: 'Delete',
		propertyName: 'Property name',
		propertyValue: 'Property value',
		addOperation: 'Add operation',
		execute: 'Execute',
		cancel: 'Cancel',
		emptyOperations: 'No operations yet, please add operations',
		noticeProperty: 'Please enter property name',
		noticeValue: 'Add or modify requires a value',
		noticeNoOp: 'Please add at least one operation',
		removeOperation: 'Remove operation',
	},

	commentSync: {
		title: 'Sync comments',
		description: 'Found {count} items with comment differences',
		allLocal: 'All local',
		allCloud: 'All cloud',
		allSkip: 'All skip',
		name: 'Subject',
		localComment: 'Local comment',
		cloudComment: 'Cloud comment',
		decision: 'Decision',
		skipLabel: 'Skip',
		keepLocal: 'Keep local',
		keepCloud: 'Keep cloud',
		empty: '(empty)',
		execute: 'Execute sync',
		cancel: 'Cancel',
		progress: 'Syncing...',
		complete: 'Sync complete: {success} succeeded, {failed} failed',
		noSelection: 'No items selected for sync',
		failed: 'Sync failed, please check network connection',
	},

	tagSync: {
		title: 'Sync tags',
		description: 'Found {count} items with tag differences',
		allLocal: 'All local',
		allCloud: 'All cloud',
		allMerge: 'All merge',
		allSkip: 'All skip',
		name: 'Subject',
		localTags: 'Local tags',
		cloudTags: 'Cloud tags',
		decision: 'Decision',
		skipLabel: 'Skip',
		keepLocal: 'Keep local',
		keepCloud: 'Keep cloud',
		merge: 'Merge',
		empty: '(empty)',
		execute: 'Execute sync',
		cancel: 'Cancel',
		progress: 'Syncing...',
		complete: 'Sync complete: {success} succeeded, {failed} failed',
		noSelection: 'No items selected for sync',
		failed: 'Sync failed, please check network connection',
	},

	subjectTypes: {
		all: 'All',
		anime: 'Anime',
		game: 'Game',
		book: 'Book',
		music: 'Music',
		real: 'Real',
	},

	collectionTypes: {
		wish: 'Wish',
		done: 'Done',
		doing: 'Doing',
		onHold: 'On hold',
		dropped: 'Dropped',
	},

	episodeContextMenu: {
		openAnimeFileFirst: 'Please open an anime subject file first',
		cannotIdentifyId: 'Cannot identify subject ID',
		watchedUpTo: 'Watched up to episode {ep}',
		markAsWatched: 'Mark as watched',
		markAsWish: 'Mark as wish',
		markAsDropped: 'Mark as dropped',
		unmark: 'Unmark',
		addComment: '📝 Add comment',
		episodeStatusSet: 'Episode {ep} set to "{status}"',
		markFailed: 'Failed, check console',
		markedEpisodes: 'Marked episodes 1-{ep} as watched',
		episodeCommentAdded: 'Added comment for episode {ep}',
		addCommentFailed: 'Failed to add comment, check console',
	},

	subjectNote: {
		notSyncedFile: 'Current active file is not a synced subject file',
		configureNotePath: 'Please configure note path template in settings first',
		missingSubjectId: 'Current file lacks a valid subject ID, cannot create subject note',
		appendedToNote: 'Appended to shared note',
		createdNote: 'Created shared note',
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
		exportUserData: '导出用户数据',
		importUserData: '导入用户数据',
		searchSubjects: '搜索并添加条目',
		checkAndSyncStatus: '检查并同步状态',
		createSubjectNote: '创建或追加条目笔记',
		batchDownloadCovers: '批量下载封面图片',
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
		tokenInvalid: 'Access Token 无效: {error}',
		usernameNotFound: '无法获取用户名，请检查 Access Token',
		templateFileNotFound: '模板文件不存在',
		readTemplateFailed: '读取模板文件失败',
		selectTemplateFirst: '请先选择模板文件',
		copiedToCustom: '已复制到自定义内容，可以开始编辑',
		templateFileSelected: '已选择模板文件',
		exportTemplatesSuccess: '模板导出成功',
		exportTemplatesFailed: '模板导出失败',
		selectExportFolder: '请选择导出文件夹',
		templateReadFailed: '模板文件读取失败: {path}',
		noteManagerNotInit: '条目笔记管理器未初始化',
		coverDownloadComplete: '封面下载完成：下载 {downloaded}，跳过 {skipped}，失败 {failed}',
		coverDownloadDisabled: '请先在设置中启用"下载封面图片"',
		coverDownloadNoItems: '没有找到含网络封面链接的条目',
	},

	settings: {
		heading: '设置',
		helpLinks: '帮助与文档',
		templateGuide: '模板设计指南',
		githubRepo: 'GitHub 仓库',
		getAccessToken: '获取 Access Token',
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
		noteTemplateContent: '笔记模板内容',
		noteTemplateContentDesc: '创建新的共享笔记文件时使用。支持变量：{{id_yaml}}、{{primary_id}}、{{name}}、{{name_cn}}、{{entry_heading}}',
		notePathTemplateDesc: '共享笔记完整文件路径模板，例如：收集箱/笔记/ACGN/{{name_cn}}.md',
		templateSettings: '模板设置',
		templateVarTip: '模板变量提示：{{tags}} 使用用户自己的标签，如果没有则留空',
		syncOptions: '同步选项',
		subjectTypesToSync: '同步的条目类型',
		subjectTypesToSyncDesc: '选择要同步的条目类型',
		collectionTypesToSync: '同步的收藏类型',
		collectionTypesToSyncDesc: '选择要同步的收藏状态',
		syncLimit: '同步数量限制',
		syncLimitDesc: '每次同步的最大条目数量（0 表示不限制，会智能处理：如果未同步数量不够，同步所有未同步的）',
		syncConcurrency: '同步并发数',
		syncConcurrencyDesc: '同时处理的条目数量（1-5）',
		syncAll: '全部',
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
		preview: '预览',
		standardTemplate: '标准模板',
		authorTemplate: '作者自用模板',
		fromFile: '从文件选择',
		customContent: '自定义内容',
		selectFile: '选择文件',
		edit: '编辑',
		copy: '复制',
		copyTooltip: '复制当前模板到自定义内容',
		exportTemplates: '导出全部模板',
		exportTemplatesDesc: '将当前所有模板保存到指定文件夹',
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
		dataProtection: '数据保护',
		dataProtectionDesc: '强制同步时保护用户数据的设置',
		preserveRatingDetails: '保留评分明细',
		preserveRatingDetailsDesc: '强制同步时保留本地的评分明细类自定义属性',
		preserveCustomProperties: '保留自定义属性',
		preserveCustomPropertiesDesc: '强制同步时保留本地自定义 frontmatter 属性',
		preserveRecord: '保留记录',
		preserveRecordDesc: '强制同步时保留“记录”部分内容',
		preserveThoughts: '保留感想',
		preserveThoughtsDesc: '强制同步时保留“感想”部分内容',
	},

	syncOptions: {
		title: '同步选项',
		subjectTypes: '条目类型',
		collectionTypes: '收藏状态',
		syncLimit: '同步数量',
		syncLimitDesc: '如果未同步数量不够，同步所有未同步的条目',
		syncAll: '全部',
		forceSync: '强制同步',
		forceSyncDesc: '忽略已存在的条目，重新同步所有选中的条目',
		selectAll: '全选',
		deselectAll: '全不选',
		startSync: '开始同步',
		cancel: '取消',
	},

	syncPreview: {
		title: '同步预览',
		itemsToSync: '个条目待同步，请确认要导入哪些条目',
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
		pause: '暂停',
		resume: '恢复',
		cancel: '取消',
		confirmCancel: '确定要取消同步吗？本次新建的文件将被移到回收站。',
		paused: '已暂停',
		syncing: '同步中',
		rollback: '回滚',
		rollbackComplete: '回滚完成：删除 {deleted} 个，失败 {failed} 个',
		rollbackFailed: '回滚失败',
		completedStats: '新增 {added}，跳过 {skipped}，失败 {errors}',
		errorDetails: '错误详情',
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
		syncStatus: '同步状态',
		comparingStatus: '正在对比状态差异...',
		noStatusDiff: '没有状态差异',
		compareStatusFailed: '对比状态失败',
		undo: '撤销',
		loading: '加载中...',
		noUndo: '没有可撤销的操作',
		undoSuccess: '撤销成功',
		undoFailed: '撤销失败',
		noSyncedItems: '没有已同步的条目',
		noSyncedItemsComment: '没有已同步的条目，无法对比短评',
		noSyncedItemsTag: '没有已同步的条目，无法对比标签',
		noSyncedItemsStatus: '没有已同步的条目，无法对比状态',
		selectFirst: '请先选择条目',
		confirmDelete: '确认删除',
		deleteConfirm: '将选中的文件移动到回收站？',
		open: '打开',
		note: '笔记',
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
		localPropertyTitle: '本地自定义属性',
		localPropertyDesc: '这里的字段会先从当前模板 frontmatter 中完整提取，再过滤掉可自动从 Bangumi 或同步流程得到的属性。剩余的本地属性都会出现在这里，包括评分明细类属性。',
		localPropertySkip: '跳过',
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

	userData: {
		exportTitle: '导出用户数据',
		exportDesc: '将本地用户数据按三部分导出到备份文件：辨识属性、自定义属性，以及“记录”/“感想”两部分内容。',
		importTitle: '导入用户数据',
		importDesc: '从备份文件导入用户数据。缺失的字段将高亮显示供您选择。',
		scanFolder: '扫描文件夹',
		scanFolderDesc: '要扫描用户数据的文件夹',
		outputDir: '输出目录',
		outputDirDesc: '保存导出文件的目录',
		export: '导出',
		import: '导入',
		cancel: '取消',
		exportSuccess: '已导出 {count} 个文件',
		exportFailed: '导出失败: {error}',
		importSuccess: '已导入 {count} 个条目',
		importSkipped: '跳过 {count} 个条目',
		importErrors: '{count} 个错误',
		importFailed: '导入失败: {error}',
		missingFieldTitle: '检测到缺失字段',
		missingFieldDesc: '导入文件中的某些字段在当前模板中不存在。请选择是否添加它们。',
		addAll: '全部添加',
		skipAll: '全部跳过',
		addField: '添加',
		skipField: '跳过',
		confirm: '确认',
		importResultTitle: '导入结果',
		missingFieldPrompt: '{count} 个缺失字段需要您决定',
		handleMissingFields: '处理缺失字段',
		skipMissingFields: '跳过缺失字段',
		close: '关闭',
		missingFieldsApplied: '已应用 {count} 个缺失字段',
		},

		statusSyncModal: {
			title: '状态同步',
			description: '发现 {count} 个条目存在数据差异，请选择要保留的版本。',
			subjectName: '条目',
			diffFields: '差异字段',
			action: '操作',
			expand: '展开',
			collapse: '收起',
			field: '字段',
			local: '本地',
			cloud: '云端',
			decision: '选择',
			fieldRate: '评分',
			fieldComment: '短评',
			fieldTags: '标签',
			fieldStatus: '状态',
			fieldEpisodeStatus: '单集状态',
			empty: '(空)',
			keepLocal: '保留本地',
			keepCloud: '保留云端',
			merge: '合并',
			skip: '跳过',
			noDiff: '没有差异',
			allLocal: '全部本地',
			allCloud: '全部云端',
			allSkip: '全部跳过',
			smartMerge: '智能合并',
			execute: '执行同步',
			cancel: '取消',
			syncProgress: '正在同步...',
			syncComplete: '同步完成：成功 {success} 个，失败 {failed} 个',
			syncFailed: '同步失败，请检查网络连接',
		},

	searchModal: {
		title: '搜索条目',
		searchPlaceholder: '输入关键词搜索...',
		search: '搜索',
		clear: '清除',
		subjectType: '条目类型',
		sortBy: '排序方式',
		sort_match: '匹配度',
		sort_heat: '热度',
		sort_rank: '排名',
		sort_score: '评分',
		searching: '搜索中...',
		resultsCount: '找到 {total} 个结果，已显示 {count} 个',
		searchFailed: '搜索失败',
		loadMore: '加载更多',
		addToCollection: '添加',
		editCollection: '编辑',
		addedSuccess: '已添加 {name}',
		noResults: '未找到相关条目',
		synced: '已同步',
		notCollected: '未收藏',
	},

	addToCollection: {
		title: '添加到收藏',
		bangumiProperties: 'Bangumi 属性',
		collectionType: '收藏状态',
		rating: '评分',
		tags: '标签',
		tagsPlaceholder: '输入标签后回车添加',
		comment: '短评',
		commentPlaceholder: '写下你的感想...',
		ratingDetails: '评分明细',
		syncOptions: '同步选项',
		syncToCloud: '同步到 Bangumi 云端',
		createLocal: '创建本地文件',
		confirm: '确认',
		cancel: '取消',
		addError: '添加失败',
	},

	batchEditor: {
		title: '批量编辑属性',
		info: '将对 {count} 个文件进行批量编辑',
		typeAdd: '新增',
		typeModify: '修改',
		typeDelete: '删除',
		propertyName: '属性名',
		propertyValue: '属性值',
		addOperation: '添加操作',
		execute: '确认执行',
		cancel: '取消',
		emptyOperations: '暂无操作，请添加要执行的属性操作',
		noticeProperty: '请输入属性名',
		noticeValue: '新增或修改属性需要输入属性值',
		noticeNoOp: '请至少添加一个操作',
		removeOperation: '移除操作',
	},

	commentSync: {
		title: '短评同步',
		description: '发现 {count} 个条目的短评存在差异',
		allLocal: '全部保留本地',
		allCloud: '全部保留云端',
		allSkip: '全部跳过',
		name: '条目',
		localComment: '本地短评',
		cloudComment: '云端短评',
		decision: '选择',
		skipLabel: '跳过',
		keepLocal: '保留本地',
		keepCloud: '保留云端',
		empty: '(空)',
		execute: '执行同步',
		cancel: '取消',
		progress: '正在同步...',
		complete: '同步完成：成功 {success} 个，失败 {failed} 个',
		noSelection: '没有选择要同步的条目',
		failed: '同步失败，请检查网络连接',
	},

	tagSync: {
		title: '标签同步',
		description: '发现 {count} 个条目的标签存在差异',
		allLocal: '全部保留本地',
		allCloud: '全部保留云端',
		allMerge: '全部合并',
		allSkip: '全部跳过',
		name: '条目',
		localTags: '本地标签',
		cloudTags: '云端标签',
		decision: '选择',
		skipLabel: '跳过',
		keepLocal: '保留本地',
		keepCloud: '保留云端',
		merge: '合并',
		empty: '(空)',
		execute: '执行同步',
		cancel: '取消',
		progress: '正在同步...',
		complete: '同步完成：成功 {success} 个，失败 {failed} 个',
		noSelection: '没有选择要同步的条目',
		failed: '同步失败，请检查网络连接',
	},

	subjectTypes: {
		all: '全部',
		anime: '动画',
		game: '游戏',
		book: '书籍',
		music: '音乐',
		real: '三次元',
	},

	collectionTypes: {
		wish: '想看',
		done: '看过',
		doing: '在看',
		onHold: '搁置',
		dropped: '抛弃',
	},

	episodeContextMenu: {
		openAnimeFileFirst: '请先打开一个动画条目文件',
		cannotIdentifyId: '无法识别条目 ID',
		watchedUpTo: '看到第{ep}集',
		markAsWatched: '标记为看过',
		markAsWish: '标记为想看',
		markAsDropped: '标记为抛弃',
		unmark: '取消收藏',
		addComment: '📝 添加吐槽',
		episodeStatusSet: '第{ep}集已设置为"{status}"',
		markFailed: '设置失败，请查看控制台',
		markedEpisodes: '已标记第1-{ep}集为"看过"',
		episodeCommentAdded: '已添加第{ep}集吐槽',
		addCommentFailed: '添加失败，请查看控制台',
	},

	subjectNote: {
		notSyncedFile: '当前活动文件不是已同步条目文件',
		configureNotePath: '请先在设置中配置笔记路径模板',
		missingSubjectId: '当前文件缺少有效的条目 ID，无法创建条目笔记',
		appendedToNote: '已追加到共享笔记',
		createdNote: '已创建共享笔记',
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
	// 使用 Obsidian 的 getLanguage API 获取语言设置
	const locale = getLanguage();
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

/**
 * 格式化翻译函数（支持变量替换）
 */
export function tnFormat<K extends keyof TranslationStrings, SK extends keyof TranslationStrings[K]>(
	category: K,
	subkey: SK,
	params: Record<string, string | number>
): string {
	let text = String(getTranslations()[category][subkey]);
	for (const [key, value] of Object.entries(params)) {
		text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
	}
	return text;
}
