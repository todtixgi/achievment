// supabase-config.js
// Конфигурация + создание клиента Supabase

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const SUPABASE_URL = "https://kzlkgslhuksdrfkjmmwb.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt6bGtnc2xodWtzZHJma2ptbXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwMTgyNTksImV4cCI6MjA3OTU5NDI1OX0.pw030dYMzo3Pz9YRsB8f1GCYTcEX4gyAaVd8zhDARpY"; // вставь реальный anon key
export const BUCKET = "images";
export const ADMIN_EMAIL = "todtixgi@gmail.com";

// создаём клиента Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
