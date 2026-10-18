CREATE OR REPLACE FUNCTION public.review_account_access(target_id uuid, decision text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN
 IF NOT public.has_role(auth.uid(),'admin') OR NOT public.is_approved(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF decision IS NULL OR decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
 IF public.has_role(target_id,'admin') THEN RAISE EXCEPTION 'Cannot change administrator access'; END IF;
 UPDATE public.profiles SET approval_status = decision, reviewed_at = now(), reviewed_by = auth.uid() WHERE id = target_id AND approval_status = 'pending';
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending account not found'; END IF;
 INSERT INTO public.account_events(user_id,kind,detail) VALUES(target_id,'approval',decision);
 END $$;
REVOKE ALL ON FUNCTION public.review_account_access(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_account_access(uuid,text) TO authenticated;