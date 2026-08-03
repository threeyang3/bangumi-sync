import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertWriteOperationAllowed, setWriteOperationGuard } from '../../src/sync/writeOperationGate';

describe('write operation gate', () => {
	afterEach(() => setWriteOperationGuard(null));

	it('passes the operation to the shared guard', () => {
		const guard = vi.fn();
		setWriteOperationGuard(guard);
		assertWriteOperationAllowed('episode-comment');
		expect(guard).toHaveBeenCalledWith('episode-comment');
	});

	it('propagates recovery blockers without writing', () => {
		const blocker = new Error('recovery required');
		setWriteOperationGuard(() => { throw blocker; });
		expect(() => assertWriteOperationAllowed('user-data-import')).toThrow(blocker);
	});
});
