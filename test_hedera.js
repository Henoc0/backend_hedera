// test-hedera.js
import { Client, PrivateKey, AccountId, FileCreateTransaction, Hbar } from "@hashgraph/sdk";
import {config} from 'dotenv';
config({path : '../.env'})

// Configuration
const client = Client.forTestnet();
client.setOperator(
  AccountId.fromString(process.env.HEDERA_ACCOUNT_ID),
  PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY.replace('0x', ''))
);

async function testHedera() {
  try {
    console.log('🚀 Début du test Hedera...\n');
    
    // 1. Test de connexion
    console.log('1. Test de connexion au compte...');
    console.log('   Compte:', process.env.HEDERA_ACCOUNT_ID);
    
    // 2. Création d'un fichier simple
    console.log('2. Création du fichier sur Hedera...');
    const fileContent = "Ceci est un test Hedera - " + new Date().toISOString();
    
    const tx = new FileCreateTransaction()
      .setContents(fileContent)
      .setMaxTransactionFee(new Hbar(1))
      .freezeWith(client);

    const signedTx = await tx.sign(PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY.replace('0x', '')));
    const submitTx = await signedTx.execute(client);
    const receipt = await submitTx.getReceipt(client);
    
    console.log('   ✅ Status:', receipt.status.toString());
    console.log('   ✅ File ID:', receipt.fileId.toString());
    
    // 3. Génération de l'URL
    const fileId = receipt.fileId.toString();
    const explorerUrl = `https://hashscan.io/testnet/file/${fileId}`;
    
    console.log('\n3. Résultat final:');
    console.log('   📄 File ID:', fileId);
    console.log('   🔗 URL à visiter:', explorerUrl);
    console.log('   📝 Contenu du fichier:', fileContent.substring(0, 50) + '...');
    
    console.log('\n🎉 Test réussi! Visitez l URL ci-dessus dans votre navigateur.');
    
    return fileId;
    
  } catch (error) {
    console.error('\n❌ ERREUR:', error.message);
    console.log('Détails:', error);
  }
}

testHedera();