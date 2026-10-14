ALTER TABLE public.script_steps ADD COLUMN kind text NOT NULL DEFAULT 'text';
ALTER TABLE public.script_steps ADD COLUMN audio_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.queue_messages ADD COLUMN media_url text;
ALTER TABLE public.queue_messages ADD COLUMN replied_at timestamptz;
CREATE TABLE public.notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  title text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  due_at timestamptz,
  done boolean NOT NULL DEFAULT false,
  color text NOT NULL DEFAULT 'default',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notes TO authenticated;
GRANT ALL ON public.notes TO service_role;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.notes FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own audio read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'audios' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own audio insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audios' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own audio delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'audios' AND (storage.foldername(name))[1] = auth.uid()::text);