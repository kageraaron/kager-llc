import { describe, it, expect } from 'vitest';
import { parseArtistLinks } from '@/lib/providers/musicbrainz';

/**
 * MusicBrainz's real value here is not metadata — it is **identity**.
 *
 * Every other provider resolves an artist by fuzzy name search, independently,
 * which is how one service says "Chris Stussy" and another says "CHRIS STASSY".
 * MusicBrainz holds the artist's actual accounts, curated by humans, so one
 * free lookup turns every later fetch from a guess into an exact call.
 *
 * Captured verbatim from the live API on 2026-08-30.
 */
const chrisStussy = [
  { type: 'bandcamp', url: { resource: 'https://chrisstussy.bandcamp.com/' } },
  { type: 'discogs', url: { resource: 'https://www.discogs.com/artist/4465293' } },
  { type: 'free streaming', url: { resource: 'https://open.spotify.com/artist/3BxjasMelf9pKaE4f7Y0So' } },
  { type: 'free streaming', url: { resource: 'https://www.deezer.com/artist/5359276' } },
  { type: 'official homepage', url: { resource: 'http://www.chrisstussy.com/' } },
  { type: 'other databases', url: { resource: 'https://ra.co/dj/chrisstussy' } },
  { type: 'soundcloud', url: { resource: 'https://soundcloud.com/djchrisstussy' } },
  { type: 'streaming', url: { resource: 'https://music.apple.com/nl/artist/746159191' } },
  { type: 'youtube', url: { resource: 'https://www.youtube.com/chrisstussy' } },
];

describe('parseArtistLinks', () => {
  const links = parseArtistLinks(chrisStussy);

  it('separates Spotify from Deezer, which share a relation type', () => {
    /*
     * Both arrive as "free streaming", so the relation type alone cannot tell
     * them apart — matching has to be on the URL. Getting this wrong would put
     * a Spotify id in the Deezer column and every later fetch would 404.
     */
    expect(links.spotifyArtistId).toBe('3BxjasMelf9pKaE4f7Y0So');
    expect(links.deezerArtistId).toBe('5359276');
  });

  it('picks up Resident Advisor, the canonical source for the club circuit', () => {
    expect(links.residentAdvisor).toBe('chrisstussy');
  });

  it('keeps the listen-and-follow links a memory app wants', () => {
    expect(links.bandcamp).toBe('https://chrisstussy.bandcamp.com/');
    expect(links.soundcloud).toBe('https://soundcloud.com/djchrisstussy');
    expect(links.officialHomepage).toBe('http://www.chrisstussy.com/');
    expect(links.discogs).toBe('https://www.discogs.com/artist/4465293');
  });

  it('keeps everything else it did not model, rather than dropping it', () => {
    expect(links.other.youtube).toContain('youtube.com');
    expect(links.other.streaming).toContain('music.apple.com');
  });

  it('handles a country-prefixed Deezer URL', () => {
    const l = parseArtistLinks([
      { type: 'free streaming', url: { resource: 'https://www.deezer.com/en/artist/194584697' } },
    ]);
    expect(l.deezerArtistId).toBe('194584697');
  });

  it('is all-null for an artist with no relations, rather than throwing', () => {
    const empty = parseArtistLinks([]);
    expect(empty.spotifyArtistId).toBeNull();
    expect(empty.deezerArtistId).toBeNull();
    expect(empty.other).toEqual({});
  });

  it('ignores a relation with no URL', () => {
    expect(() => parseArtistLinks([{ type: 'bandcamp' }])).not.toThrow();
    expect(parseArtistLinks([{ type: 'bandcamp' }]).bandcamp).toBeNull();
  });
});
