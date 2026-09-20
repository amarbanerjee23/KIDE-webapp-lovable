REVOKE ALL ON FUNCTION public.has_organization_role(uuid, public.app_role[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_organization_role(uuid, public.app_role[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, public.app_role[]) TO authenticated;
REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;