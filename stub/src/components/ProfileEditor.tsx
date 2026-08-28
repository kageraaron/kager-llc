'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { updateProfile } from '@/app/actions';
import { createClient } from '@/lib/supabase/client';

interface Profile {
  id: string;
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  home_city: string | null;
}

export function ProfileEditor({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    handle: profile.handle,
    display_name: profile.display_name,
    bio: profile.bio,
    home_city: profile.home_city ?? '',
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updateProfile(form);
      if (res.ok) {
        setOpen(false);
        // The handle is in the URL, so a rename has to navigate, not just refresh.
        if (form.handle !== profile.handle) router.replace(`/profile/${form.handle}`);
        else router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  /** Avatars go to Supabase Storage under a per-user path. */
  async function uploadAvatar(file: File) {
    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${profile.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '3600' });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      // Cache-bust so the new image shows immediately at the same path.
      const url = `${data.publicUrl}?v=${Date.now()}`;

      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', profile.id);
      if (dbErr) throw dbErr;

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-block" style={{ marginTop: 14 }} onClick={() => setOpen(true)}>
        Edit profile
      </button>
    );
  }

  return (
    <div className="stack" style={{ marginTop: 14 }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadAvatar(file);
        }}
      />
      <button className="btn btn-block" disabled={uploading} onClick={() => fileRef.current?.click()}>
        {uploading ? 'Uploading...' : 'Change photo'}
      </button>

      <label className="stack" style={{ gap: 4 }}>
        <span className="muted">Handle</span>
        <input
          className="input"
          value={form.handle}
          autoCapitalize="none"
          onChange={(e) => setForm({ ...form, handle: e.target.value })}
        />
      </label>

      <label className="stack" style={{ gap: 4 }}>
        <span className="muted">Name</span>
        <input
          className="input"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />
      </label>

      <label className="stack" style={{ gap: 4 }}>
        <span className="muted">Home city</span>
        <input
          className="input"
          value={form.home_city}
          placeholder="Used to surface shows near you"
          onChange={(e) => setForm({ ...form, home_city: e.target.value })}
        />
      </label>

      <label className="stack" style={{ gap: 4 }}>
        <span className="muted">Bio</span>
        <textarea
          className="input"
          style={{ minHeight: 80 }}
          maxLength={500}
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
        />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="row" style={{ gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => setOpen(false)}>Cancel</button>
        <button className="btn btn-primary" style={{ flex: 1 }} disabled={pending} onClick={save}>
          {pending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}
