CREATE TABLE public.instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  instance_name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'disconnected',
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT '',
  phone text NOT NULL,
  company text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  is_admin boolean NOT NULL DEFAULT false,
  is_valid boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);
CREATE TABLE public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.list_contacts (
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  PRIMARY KEY (list_id, contact_id)
);
CREATE TABLE public.scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.script_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id uuid NOT NULL REFERENCES public.scripts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  position int NOT NULL DEFAULT 0,
  variations text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL,
  instance_id uuid REFERENCES public.instances(id) ON DELETE SET NULL,
  list_id uuid REFERENCES public.lists(id) ON DELETE SET NULL,
  script_id uuid REFERENCES public.scripts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'running',
  start_hour int NOT NULL DEFAULT 9,
  end_hour int NOT NULL DEFAULT 18,
  weekdays int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  daily_limit int NOT NULL DEFAULT 50,
  contact_min_sec int NOT NULL DEFAULT 180,
  contact_max_sec int NOT NULL DEFAULT 420,
  msg_min_sec int NOT NULL DEFAULT 15,
  msg_max_sec int NOT NULL DEFAULT 30,
  start_now boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.queue_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  phone text NOT NULL,
  contact_name text NOT NULL DEFAULT '',
  step_position int NOT NULL DEFAULT 0,
  variation_index int NOT NULL DEFAULT 0,
  content text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  error text,
  attempts int NOT NULL DEFAULT 0,
  sent_at timestamptz,
  replied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX queue_due_idx ON public.queue_messages (status, scheduled_at);
CREATE INDEX queue_campaign_idx ON public.queue_messages (campaign_id, contact_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instances','contacts','lists','list_contacts','scripts','script_steps','campaigns','queue_messages'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "own rows" ON public.%I FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)', t);
  END LOOP;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.queue_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instances;