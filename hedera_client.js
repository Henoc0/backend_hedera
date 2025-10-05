import 'dotenv/config';
import { Client, PrivateKey } from "@hashgraph/sdk";

// Charger les variables d'environnement
config();

// Charger les variables d'environnement
const accountId = process.env.HEDERA_ACCOUNT_ID;
const privateKey = process.env.HEDERA_PRIVATE_KEY;

if (!accountId || !privateKey) {
  throw new Error("HEDERA_ACCOUNT_ID et HEDERA_PRIVATE_KEY doivent être définis dans .env");
}

// Créer et configurer le client Hedera
const client = Client.forTestnet();
client.setOperator(accountId, PrivateKey.fromString(privateKey));

export default client;