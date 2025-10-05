// env.js - VERSION CORRIGÉE
import { config } from "dotenv";
import { resolve } from "path";  // ⭐ IMPORT AJOUTÉ

config({ 
  path: resolve(process.cwd(), ".env"),  // ⭐ PARENTHÈSE CORRIGÉE
  debug: true, 
  quiet: true 
});

export const supabaseUrl = process.env.VITE_SUPABASE_URL;  // ⭐ AJOUTER "VITE_"
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
export const hederaAccountId = process.env.HEDERA_ACCOUNT_ID;
export const hederaPrivateKey = process.env.HEDERA_PRIVATE_KEY;

// Debug
console.log('🔧 env.js chargé - URL:', supabaseUrl ? '✅' : '❌');