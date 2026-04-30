/**
 * 移动端检测工具函数
 */

/**
 * 检测是否为移动设备
 * 依据：屏幕宽度 < 768px 或支持触摸事件
 */
export function isMobile(): boolean {
	return window.innerWidth < 768 || 'ontouchstart' in window;
}

/**
 * 监听移动端状态变化
 * @param callback 状态变化时的回调函数
 * @returns 清理函数
 */
export function onMobileChange(callback: (isMobile: boolean) => void): () => void {
	const query = window.matchMedia('(max-width: 767px)');
	const handler = (e: MediaQueryListEvent) => callback(e.matches);
	query.addEventListener('change', handler);
	return () => query.removeEventListener('change', handler);
}