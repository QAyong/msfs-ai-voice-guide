import { describe, expect, it } from 'vitest';
import { exploreNarrationPromptMarker } from '../../shared/explore-contracts.js';
import { buildExploreNarrationPrompt } from '../../src/explore/narrator.js';

describe('automatic tour narration prompt', () => {
  it('uses the strengthened English tour-guide instructions and only whitelisted context', () => {
    const prompt = buildExploreNarrationPrompt({
      locale: 'en-US',
      recentConversation: [{ id: 'm1', role: 'user', text: 'What am I flying over?' }],
      msfs: {
        capturedAt: '2026-08-21T00:00:00.000Z',
        position: { latitude: 48.8566, longitude: 2.3522, altitudeMeters: 1_200 },
        place: { country: 'France', city: 'Paris' },
        gamePois: [{ name: 'Eiffel Tower', distanceKm: 7, providerSource: 'simulator' }],
        route: { originIcao: 'LFPG', destinationIcao: 'EGLL' },
      },
    });

    expect(prompt).toContain(exploreNarrationPromptMarker);
    expect(prompt).toContain('active in-flight tour guide');
    expect(prompt).toContain('Make the experience feel like a tour');
    expect(prompt).toContain('Required output language: English');
    expect(prompt).toContain('Do not call tools');
    expect(prompt).toContain('Eiffel Tower');
    expect(prompt).toContain('LFPG');
    expect(prompt).not.toContain('capturedAt');
    expect(prompt).not.toContain('contextId');
  });
});
