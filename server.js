export default function handler(req, res) {
  res.status(200).json({
    message: "Test works!",
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_ANON_KEY,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      hasGoogleKey: !!process.env.GOOGLE_API_KEY,
    },
  });
}
