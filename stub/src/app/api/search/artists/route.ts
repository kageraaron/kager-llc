import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { searchAttractions, pickImage } from '@/lib/providers/ticketmaster';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const q = request.nextUrl.searchParams.get('q');
  if (!q || q.trim().length < 2) return NextResponse.json({ artists: [] });

  try {
    const attractions = await searchAttractions(q.trim());
    return NextResponse.json({
      artists: attractions.map((a) => ({
        tmId: a.id,
        name: a.name,
        image: pickImage(a.images, 300),
        genres: [
          ...new Set(
            (a.classifications ?? [])
              .flatMap((c) => [c.genre?.name, c.subGenre?.name])
              .filter((g): g is string => !!g && g !== 'Undefined'),
          ),
        ].slice(0, 2),
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'search failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
