// Browser Supabase client. It uses only the public anon key; row level security protects the data.
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export { loginEmail, USERNAME } from '../../lib/accounts';
