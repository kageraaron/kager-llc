export type AttendanceState = 'going' | 'interested' | 'went' | 'missed';
export type AttendanceVisibility = 'friends' | 'private';
export type AttendanceSource = 'manual' | 'gmail' | 'forward' | 'setlistfm' | 'friend';
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';
export type ArtistSource = 'manual' | 'spotify' | 'applemusic' | 'setlistfm';
export type CandidateState = 'pending' | 'confirmed' | 'rejected';

export interface Artist {
  id: string;
  mbid: string | null;
  tm_id: string | null;
  name: string;
  image_url: string | null;
  genres: string[];
}

export interface Venue {
  id: string;
  tm_id: string | null;
  name: string;
  city: string | null;
  region: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  timezone: string | null;
}

export interface StubEvent {
  id: string;
  tm_id: string | null;
  setlistfm_id: string | null;
  name: string;
  headliner_id: string | null;
  venue_id: string | null;
  starts_at: string;
  timezone: string | null;
  status: string;
  url: string | null;
  image_url: string | null;
}

export interface Attendance {
  id: string;
  user_id: string;
  event_id: string;
  state: AttendanceState;
  visibility: AttendanceVisibility;
  source: AttendanceSource;
  ticket_ref: string | null;
  seat_info: string | null;
  price_cents: number | null;
  ticket_quantity: number | null;
  purchased_at: string | null;
}

export interface Profile {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  home_city: string | null;
}

/**
 * What every email extractor must produce. Deliberately loose — a confirmation
 * email often gives us an artist and a date but no venue, or a venue and a date
 * but a tour name instead of an artist. The matcher scores whatever it gets.
 */
export interface ParsedTicket {
  artistName?: string;
  eventName?: string;
  venueName?: string;
  city?: string;
  region?: string;
  country?: string;
  /** ISO 8601. Local wall time if no zone could be determined. */
  startsAt?: string;
  ticketRef?: string;
  seatInfo?: string;
  priceCents?: number;
  ticketQuantity?: number;
  currency?: string;
  purchasedAt?: string;
  /**
   * Eventbrite event id, scraped from a link in the email. Decisive when
   * present: it identifies the exact event rather than describing it.
   */
  ebEventId?: string;
  /** Ticketmaster event id, when the email hands it to us directly. */
  tmEventId?: string;
  sourceUrl?: string;
}

export interface NormalizedEmail {
  from: string;
  subject: string;
  html: string;
  text: string;
  receivedAt: string;
  providerMsgId?: string;
}

export interface Extractor {
  name: string;
  /** Cheap predicate — sender/subject only, no parsing. */
  match(email: NormalizedEmail): boolean;
  parse(email: NormalizedEmail): ParsedTicket | null;
}
