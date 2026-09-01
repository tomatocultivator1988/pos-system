-- Storage bucket for menu item images
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for menu images
CREATE POLICY IF NOT EXISTS "Public read menu images"
ON storage.objects FOR SELECT USING (bucket_id = 'menu-images');

-- Allow inserts (server-side uses service_role, this is for RLS completeness)
CREATE POLICY IF NOT EXISTS "Admin insert menu images"
ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'menu-images');
