import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertWriteOperationAllowed, setWriteOperationGuard, withWriteOperation } from '../../src/sync/writeOperationGate';

describe('write operation gate', () => {
	afterEach(() => setWriteOperationGuard(null));

	it('passes the operation to the shared guard', () => {
		const guard = vi.fn();
		setWriteOperationGuard(guard);
		assertWriteOperationAllowed('episode-comment');
		expect(guard).toHaveBeenCalledWith('episode-comment', undefined);
	});

	it('propagates recovery blockers without writing', () => {
		const blocker = new Error('recovery required');
		setWriteOperationGuard(() => { throw blocker; });
		expect(() => assertWriteOperationAllowed('user-data-import')).toThrow(blocker);
	});
});

it('holds the lease across awaits, allows explicit children, and releases after failure', async () => {
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 const running=withWriteOperation('status-sync',async lease=>{
  await withWriteOperation('episode-status',()=>Promise.resolve(),lease);await held;throw new Error('injected');
 });
 const outcome=expect(running).rejects.toThrow('injected');
 await expect(withWriteOperation('user-data-import',()=>Promise.resolve())).rejects.toThrow('in progress');
 release();await outcome;await expect(withWriteOperation('subject-note',()=>Promise.resolve('ok'))).resolves.toBe('ok');
});
