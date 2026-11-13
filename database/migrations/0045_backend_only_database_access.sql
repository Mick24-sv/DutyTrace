-- Express owns authorization. Browser Supabase roles must not access app data
-- directly, even if an accidentally permissive RLS policy is added later.
-- Leave extension-owned objects and trusted backend ownership unchanged.
DO $$
DECLARE item record; client_role text;
BEGIN
 FOR item IN
  SELECT c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p','S')
    AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
 LOOP
  EXECUTE format('REVOKE ALL ON %s public.%I FROM PUBLIC',CASE WHEN item.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,item.relname);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
    EXECUTE format('REVOKE ALL ON %s public.%I FROM %I',CASE WHEN item.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,item.relname,client_role);
   END IF;
  END LOOP;
 END LOOP;
 FOR item IN
  SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prorettype='trigger'::regtype
 LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',item.signature);
  FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',item.signature,client_role);
   END IF;
  END LOOP;
 END LOOP;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
 ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
 FOREACH client_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=client_role) THEN
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',client_role);
   EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',client_role);
  END IF;
 END LOOP;
END $$;
