// test-variables.js
import {config} from 'dotenv';
config({path : '../.env'})

console.log('=== TEST VARIABLES UNIFIÉES ===');
console.log('HEDERA_ACCOUNT_ID:', process.env.HEDERA_ACCOUNT_ID);
console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL || 'MANQUANTE');
console.log('SUPABASE_SERVICE_KEY:', process.env.SUPBASE_SERVICE_KEY || 'MANQUANTE');
console.log('SUPABASE_SERVICE_KEY:', process.env.HEDERA_PRIVATE_KEY || 'MANQUANTE');