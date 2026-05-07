/**
 * 移动端检测工具函数
 */

/**
 * 检测是否为移动设备
 * 依据：屏幕宽度 < 768px
 */
export function isMobile(): boolean {
	return activeWindow.matchMedia('(max-width: 767px)').matches;
}

/**
 * 监听移动端状态变化
 * @param callback 状态变化时的回调函数
 * @returns 清理函数
 */
export function onMobileChange(callback: (isMobile: boolean) => void): () => void {
	const query = activeWindow.matchMedia('(max-width: 767px)');
	const handler = (e: MediaQueryListEvent) => callback(e.matches);
	query.addEventListener('change', handler);
	return () => query.removeEventListener('change', handler);
}
