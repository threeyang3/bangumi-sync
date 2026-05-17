import { describe, expect, it } from 'vitest';
import {
        cloneStatusSyncFieldSelection,
        createDefaultStatusSyncFieldSelection,
        getStatusSyncScope,
        hasSelectedPlatformFields,
        hasSelectedUserFields,
        normalizeStatusSyncFieldSelection,
} from '../../src/sync/statusSyncTypes';

describe('statusSyncTypes', () => {
        it('defaults to all user fields and no platform fields', () => {
                const selection = createDefaultStatusSyncFieldSelection();

                expect(hasSelectedUserFields(selection)).toBe(true);
                expect(hasSelectedPlatformFields(selection)).toBe(false);
                expect(selection.user.rate).toBe(true);
                expect(selection.user.episodeStatus).toBe(true);
                expect(selection.platform.episodeCount).toBe(false);
                expect(selection.platform.progress).toBe(false);
                expect(getStatusSyncScope(selection)).toBe('user');
        });

        it('supports platform-only and mixed scopes through explicit selection', () => {
                const platformOnly = createDefaultStatusSyncFieldSelection();
                platformOnly.user.rate = false;
                platformOnly.user.comment = false;
                platformOnly.user.tags = false;
                platformOnly.user.status = false;
                platformOnly.user.episodeStatus = false;
                platformOnly.platform.episodeCount = true;
                platformOnly.platform.chapterCount = true;
                platformOnly.platform.volumeCount = true;
                platformOnly.platform.start = true;
                platformOnly.platform.end = true;
                platformOnly.platform.progress = true;

                expect(hasSelectedUserFields(platformOnly)).toBe(false);
                expect(hasSelectedPlatformFields(platformOnly)).toBe(true);
                expect(getStatusSyncScope(platformOnly)).toBe('platform');

                const mixed = cloneStatusSyncFieldSelection(platformOnly);
                mixed.user.comment = true;
                expect(getStatusSyncScope(mixed)).toBe('mixed');
        });

        it('clones field selections without sharing references', () => {
                const original = createDefaultStatusSyncFieldSelection();
                const copy = cloneStatusSyncFieldSelection(original);

                copy.user.rate = false;
                copy.platform.end = true;

                expect(original.user.rate).toBe(true);
                expect(original.platform.end).toBe(false);
        });

        it('normalizes missing user/platform branches safely', () => {
                const empty = normalizeStatusSyncFieldSelection(undefined);
                expect(empty.user.rate).toBe(true);
                expect(empty.platform.episodeCount).toBe(false);

                const userOnly = normalizeStatusSyncFieldSelection({
                        user: { rate: false },
                });
                expect(userOnly.user.rate).toBe(false);
                expect(userOnly.user.comment).toBe(true);
                expect(userOnly.platform.volumeCount).toBe(false);

                const platformOnly = normalizeStatusSyncFieldSelection({
                        platform: { episodeCount: true, progress: true },
                });
                expect(platformOnly.user.rate).toBe(true);
                expect(platformOnly.platform.episodeCount).toBe(true);
                expect(platformOnly.platform.progress).toBe(true);
                expect(platformOnly.platform.start).toBe(false);
        });
});
