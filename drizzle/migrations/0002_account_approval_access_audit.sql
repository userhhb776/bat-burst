CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 100),
 email text NOT NULL DEFAULT '',
 approval_status text NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending','approved','rejected')),
 requested_at timestamptz, reviewed_at timestamptz, reviewed_by uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.user_roles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role public.app_role NOT NULL, UNIQUE(user_id,role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE FUNCTION public.is_approved(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND approval_status = 'approved') $$;
REVOKE ALL ON FUNCTION public.has_role(uuid,public.app_role), public.is_approved(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid,public.app_role), public.is_approved(uuid) TO authenticated, service_role;
CREATE POLICY "own or admin profiles" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
INSERT INTO public.profiles(id,name,email,approval_status,requested_at) SELECT id, COALESCE(raw_user_meta_data->>'name', split_part(email,'@',1)), COALESCE(email,''), CASE WHEN id = 'bfd0f23f-35a6-42c5-88b2-8d5461ffac9d' THEN 'approved' ELSE 'pending' END, CASE WHEN id = 'bfd0f23f-35a6-42c5-88b2-8d5461ffac9d' THEN now() ELSE NULL END FROM auth.users;
INSERT INTO public.user_roles(user_id,role) SELECT id,'admin'::public.app_role FROM public.profiles WHERE id = 'bfd0f23f-35a6-42c5-88b2-8d5461ffac9d';
CREATE FUNCTION public.create_account_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF char_length(trim(COALESCE(NEW.raw_user_meta_data->>'name',''))) < 2 OR char_length(trim(NEW.raw_user_meta_data->>'name')) > 100 THEN RAISE EXCEPTION 'Informe seu nome (2 a 100 caracteres)'; END IF;
 INSERT INTO public.profiles(id,name,email) VALUES(NEW.id,trim(NEW.raw_user_meta_data->>'name'),COALESCE(NEW.email,'')); RETURN NEW; END $$;
CREATE TRIGGER create_account_profile AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.create_account_profile();
CREATE TABLE public.account_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL DEFAULT auth.uid(),
 kind text NOT NULL CHECK(kind IN ('login','page','search','action','data','approval')),
 path text NOT NULL DEFAULT '' CHECK(char_length(path)<=200),
 detail text NOT NULL DEFAULT '' CHECK(char_length(detail)<=300),
 device text NOT NULL DEFAULT '' CHECK(char_length(device)<=400),
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_events TO authenticated;
GRANT ALL ON public.account_events TO service_role;
ALTER TABLE public.account_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX account_events_user_time ON public.account_events(user_id,created_at DESC,id);
CREATE INDEX profiles_requests ON public.profiles(approval_status,requested_at);
CREATE POLICY "admin reports only" ON public.account_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE FUNCTION public.request_account_access() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 UPDATE public.profiles SET requested_at = now() WHERE id = auth.uid() AND approval_status = 'pending' AND requested_at IS NULL;
 END $$;
CREATE FUNCTION public.review_account_access(target_id uuid, decision text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF public.has_role(target_id,'admin') THEN RAISE EXCEPTION 'Cannot change administrator access'; END IF;
 UPDATE public.profiles SET approval_status = decision, reviewed_at = now(), reviewed_by = auth.uid() WHERE id = target_id AND requested_at IS NOT NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
 INSERT INTO public.account_events(user_id,kind,detail) VALUES(target_id,'approval',decision);
 END $$;
CREATE FUNCTION public.record_account_events(events jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE ev jsonb; BEGIN
 IF auth.uid() IS NULL OR jsonb_typeof(events) <> 'array' OR jsonb_array_length(events)>20 THEN RAISE EXCEPTION 'Invalid events'; END IF;
 IF (SELECT count(*) FROM public.account_events WHERE user_id=auth.uid() AND created_at>now()-interval '1 minute') >= 60 THEN RETURN; END IF;
 FOR ev IN SELECT value FROM jsonb_array_elements(events) LOOP
 IF ev->>'kind' NOT IN ('login','page','search','action') THEN RAISE EXCEPTION 'Invalid event kind'; END IF;
 IF ev->>'kind' <> 'login' AND NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'Approval required'; END IF;
 INSERT INTO public.account_events(user_id,kind,path,detail,device) VALUES(auth.uid(),ev->>'kind',left(COALESCE(ev->>'path',''),200),left(COALESCE(ev->>'detail',''),300),left(COALESCE(ev->>'device',''),400));
 END LOOP; END $$;
REVOKE ALL ON FUNCTION public.request_account_access(),public.review_account_access(uuid,text),public.record_account_events(jsonb),public.create_account_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_access(),public.review_account_access(uuid,text),public.record_account_events(jsonb) TO authenticated;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['instances','contacts','lists','list_contacts','scripts','script_steps','campaigns','queue_messages','notes'] LOOP
 EXECUTE format('CREATE POLICY "approved access required" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(public.is_approved(auth.uid())) WITH CHECK(public.is_approved(auth.uid()))',t);
 END LOOP; END $$;
CREATE POLICY "approved audio access" ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated USING(bucket_id <> 'audios' OR public.is_approved(auth.uid())) WITH CHECK(bucket_id <> 'audios' OR public.is_approved(auth.uid()));
CREATE FUNCTION public.audit_account_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF auth.uid() IS NOT NULL THEN INSERT INTO public.account_events(user_id,kind,path,detail) VALUES(auth.uid(),'data',TG_TABLE_NAME,TG_OP || ' ' || COALESCE(to_jsonb(CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END)->>'id','')); END IF;
 RETURN NULL; END $$;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['instances','contacts','lists','list_contacts','scripts','script_steps','campaigns','notes'] LOOP
 EXECUTE format('CREATE TRIGGER audit_account_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_account_change()',t);
 END LOOP; END $$;
REVOKE ALL ON FUNCTION public.audit_account_change() FROM PUBLIC;