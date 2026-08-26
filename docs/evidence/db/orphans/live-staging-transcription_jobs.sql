--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: transcription_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transcription_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    source_id uuid NOT NULL,
    storage_bucket text NOT NULL,
    storage_object_path text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    provider text DEFAULT 'cloudflare-workers-ai'::text NOT NULL,
    model text DEFAULT '@cf/openai/whisper-large-v3-turbo'::text NOT NULL,
    transcript_text text,
    detected_language text,
    error_code text,
    attempt_count integer DEFAULT 0 NOT NULL,
    processing_started_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT transcription_jobs_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 3))),
    CONSTRAINT transcription_jobs_completed_has_text CHECK (((status <> 'completed'::text) OR ((transcript_text IS NOT NULL) AND (completed_at IS NOT NULL)))),
    CONSTRAINT transcription_jobs_failed_has_code CHECK (((status <> 'failed'::text) OR (error_code IS NOT NULL))),
    CONSTRAINT transcription_jobs_model_check CHECK ((model = '@cf/openai/whisper-large-v3-turbo'::text)),
    CONSTRAINT transcription_jobs_provider_check CHECK ((provider = 'cloudflare-workers-ai'::text)),
    CONSTRAINT transcription_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'processing'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT transcription_jobs_storage_bucket_check CHECK ((storage_bucket ~ '^[a-z0-9][a-z0-9._-]{0,62}$'::text)),
    CONSTRAINT transcription_jobs_storage_object_path_check CHECK (((length(storage_object_path) >= 3) AND (length(storage_object_path) <= 512)))
);

ALTER TABLE ONLY public.transcription_jobs FORCE ROW LEVEL SECURITY;


--
-- Name: transcription_jobs transcription_jobs_object_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcription_jobs
    ADD CONSTRAINT transcription_jobs_object_unique UNIQUE (user_id, source_id, storage_bucket, storage_object_path);


--
-- Name: transcription_jobs transcription_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcription_jobs
    ADD CONSTRAINT transcription_jobs_pkey PRIMARY KEY (id);


--
-- Name: transcription_jobs_claim_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcription_jobs_claim_idx ON public.transcription_jobs USING btree (status, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'processing'::text]));


--
-- Name: transcription_jobs_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcription_jobs_source_idx ON public.transcription_jobs USING btree (source_id);


--
-- Name: transcription_jobs_user_recent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX transcription_jobs_user_recent_idx ON public.transcription_jobs USING btree (user_id, created_at DESC);


--
-- Name: transcription_jobs transcription_jobs_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER transcription_jobs_touch BEFORE UPDATE ON public.transcription_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: transcription_jobs transcription_jobs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcription_jobs
    ADD CONSTRAINT transcription_jobs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;


--
-- Name: transcription_jobs transcription_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transcription_jobs
    ADD CONSTRAINT transcription_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: transcription_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: transcription_jobs transcription_jobs_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY transcription_jobs_select_own ON public.transcription_jobs FOR SELECT TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid)));


--
-- Name: TABLE transcription_jobs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.transcription_jobs TO service_role;


--
-- Name: COLUMN transcription_jobs.id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(id) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.source_id; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(source_id) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.status; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(status) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.provider; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(provider) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.model; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(model) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.transcript_text; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(transcript_text) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.detected_language; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(detected_language) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.error_code; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(error_code) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.attempt_count; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(attempt_count) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(created_at) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(updated_at) ON TABLE public.transcription_jobs TO authenticated;


--
-- Name: COLUMN transcription_jobs.completed_at; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT(completed_at) ON TABLE public.transcription_jobs TO authenticated;


--
-- PostgreSQL database dump complete
--


