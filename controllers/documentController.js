// controllers/documentController.js
import {config} from 'dotenv';
config({path : './../.env'});
import { createClient } from '@supabase/supabase-js';
import { Client, PrivateKey, AccountId, FileCreateTransaction, FileContentsQuery, FileId, Hbar } from "@hashgraph/sdk";
import crypto from 'crypto';
import { supabaseServiceKey, supabaseUrl } from './env.js';

//CONFIGURATIONS INITIALES

/**
 CONFIGURATION SUPABASE
 Client pour interagir avec la base de données et le storage
 */
const supabase = createClient(supabaseUrl,supabaseServiceKey);// Clé avec plus de permissions

/**
 * 🔧 CONFIGURATION HEDERA
 * Client pour interagir avec la blockchain Hedera (Testnet)
 */
const hederaClient = Client.forTestnet();
hederaClient.setOperator(
  AccountId.fromString(process.env.HEDERA_ACCOUNT_ID),
  PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY)
);

/**
 * CALCULER LE HASH D'UN FICHIER
 * Utilisé pour générer l'empreinte numérique du document
 */
const calculateFileHash = (fileBuffer) => {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
};

/**
 * 🔹 VALIDER LES DONNÉES REQUISES
 * Sécurité: vérifier que toutes les données nécessaires sont présentes
 */
const validateRequiredFields = (data, requiredFields) => {
  const missingFields = requiredFields.filter(field => !data[field]);
  if (missingFields.length > 0) {
    throw new Error(`Champs manquants: ${missingFields.join(', ')}`);
  }
};

//   ROUTES DOCUMENTS - GESTION COMPLÈTE


/**
  1. UPLOAD ET ANCRAGE COMPLET D'UN DOCUMENT
 */
export const uploadAndAnchorDocument = async (req, res) => {
  try {
    //  MAINTENANT on reçoit le fichier brut, pas le buffer
    validateRequiredFields(req.body, ['userId', 'fileName', 'file']);

    const { userId, fileName, file } = req.body; // 'file' au lieu de 'fileBuffer'

    // 1. CONVERTIR le base64 en Buffer
    const fileBuffer = Buffer.from(file.split(',')[1], 'base64');
    
    // 2. CALCULER LE HASH (maintenant côté backend)
    const fileHash = calculateFileHash(fileBuffer);

    console.log(`📄 Calcul hash backend: ${fileHash.substring(0, 16)}...`);

    // 3. TRANSACTION HEDERA
    const tx = new FileCreateTransaction()
      .setContents(fileHash)
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(hederaClient);

    const signedTx = await tx.sign(PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY.replace('0x', '')));
    const submittedTx = await signedTx.execute(hederaClient);
    const receipt = await submittedTx.getReceipt(hederaClient);

    // DEBUG CRITIQUE
    console.log('=== DEBUG HEDERA ===');
    console.log('Status:', receipt.status.toString());
    console.log('File ID:', receipt.fileId?.toString());

    if (receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`Transaction Hedera échouée: ${receipt.status.toString()}`);
    }

    const hederaFileId = receipt.fileId.toString();
    const transactionId = submittedTx.transactionId.toString();

    // 4. UPLOAD SUPABASE STORAGE
    const filePath = `users/${userId}/documents/${Date.now()}_${fileName}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: req.body.mimeType || 'application/octet-stream',
        upsert: false
      });

    if (uploadError) throw new Error(`Erreur upload: ${uploadError.message}`);

    // 5. ENREGISTREMENT BDD
    const { data: dbData, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        filename: fileName,
        file_hash: fileHash,
        hedera_file_id: hederaFileId,
        hedera_transaction_id: transactionId,
        file_path: uploadData.path,
        file_size: fileBuffer.length,
        file_type: req.body.mimeType || 'application/octet-stream',
        status: 'anchored',
        verified_at: new Date().toISOString(),
        uploaded_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from('documents').remove([uploadData.path]);
      throw new Error(`Erreur DB: ${dbError.message}`);
    }

    // 6. RÉPONSE
    return res.status(201).json({
      success: true,
      message: "✅ Document uploadé et ancré sur Hedera avec succès",
      document: {
        id: dbData.id,
        name: dbData.name,
        fileHash: fileHash,
        fileSize: fileBuffer.length,
        createdAt: dbData.created_at
      },
      hederaProof: {
        fileId: hederaFileId,
        transactionId: transactionId,
        transactionUrl: `https://hashscan.io/testnet/transaction/${transactionId}`,
        fileUrl: `https://hashscan.io/testnet/file/${hederaFileId}`
      },
      storage: {
        downloadUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${uploadData.path}`,
        path: uploadData.path
      }
    });

  } catch (error) {
    console.error("❌ Erreur upload document:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      step: "upload_and_anchor"
    });
  }
};

/**
  2. VÉRIFICATION D'AUTHENTICITÉ D'UN DOCUMENT
 * - Compare le hash actuel d'un document avec celui ancré sur Hedera
 * - Vérifie l'intégrité et la non-altération du document
 * - Met à jour le statut de vérification en base
 */
export const verifyDocumentAuthenticity = async (req, res) => {
  try {
    const { hederaFileId } = req.params;
    const { currentHash } = req.body;

    validateRequiredFields({ hederaFileId, currentHash }, ['hederaFileId', 'currentHash']);

    console.log(`🔍 Vérification document: ${hederaFileId}`);


    // 1.  RÉCUPÉRATION DU DOCUMENT DEPUIS SUPABASE
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('hedera_file_id', hederaFileId)
      .single();

    if (docError || !document) {
      return res.status(404).json({
        success: false,
        error: "Document non trouvé en base de données"
      });
    }

    // 2.  RÉCUPÉRATION DU HASH ORIGINAL SUR HEDERA
    let hederaHash;
    try {
      const query = new FileContentsQuery()
        .setFileId(FileId.fromString(hederaFileId));
      
      const response = await query.execute(hederaClient);
      hederaHash = response.toString();
    } catch (hederaError) {
      return res.status(500).json({
        success: false,
        error: `Impossible de vérifier sur Hedera: ${hederaError.message}`
      });
    }

    // 3. VÉRIFICATIONS D'AUTHENTICITÉ
    const verificationResults = {
      hashConsistency: currentHash === hederaHash,
      databaseIntegrity: document.file_hash === hederaHash,
      documentUnchanged: currentHash === document.file_hash,
      overallAuthentic: currentHash === hederaHash && document.file_hash === hederaHash
    };

    // 4. MISE À JOUR DU STATUT
    const newStatus = verificationResults.overallAuthentic ? 'authentic' : 'modified';
    await supabase
      .from('documents')
      .update({
        verification_status: newStatus,
        last_verified_at: new Date().toISOString(),
        verification_count: (document.verification_count || 0) + 1
      })
      .eq('id', document.id);

    // 5. PRÉPARATION DE LA RÉPONSE DÉTAILLÉE
    const response = {
      success: true,
      isAuthentic: verificationResults.overallAuthentic,
      verification: verificationResults,
      timestamps: {
        anchored: document.anchored_at,
        lastVerified: new Date().toISOString(),
        firstUpload: document.created_at
      },
      hashes: {
        current: currentHash,
        database: document.file_hash,
        hedera: hederaHash
      },
      document: {
        id: document.id,
        name: document.name,
        size: document.file_size,
        hederaFileId: document.hedera_file_id
      },
      message: verificationResults.overallAuthentic 
        ? "✅ Document authentique - Aucune altération détectée"
        : "❌ Document modifié - Intégrité compromise"
    };

    console.log(`📊 Vérification terminée: ${response.message}`);
    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Erreur vérification:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
      step: "verification"
    });
  }
};

/**
 * 📋 3. LISTE DES DOCUMENTS D'UN UTILISATEUR
  DESCRIPTION:
 * - Récupère tous les documents d'un utilisateur avec leur statut
 * - Inclut les preuves d'authenticité Hedera
 * - Fournit des statistiques de vérification
 */
export const getUserDocuments = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "ID utilisateur requis"
      });
    }

    console.log(`📁 Récupération documents pour l'utilisateur: ${userId}`);

    // 1. 📊 RÉCUPÉRATION DES DOCUMENTS
    const { data: documents, error: docsError } = await supabase
      .from('documents')
      .select(`
        id,
        filename,
        file_hash,
        hedera_file_id,
        hedera_transaction_id,
        file_path,
        file_size,
        file_type,
        status,
        uploaded_at,
        verified_at,
        last_verified_at,
        verification_count
      `)
      .eq('user_id', userId)
      .order('uploaded_at', { ascending: false });

    if (docsError) throw docsError;

    // 2. 📈 CALCUL DES STATISTIQUES
    const stats = {
      total: documents?.length || 0,
      authentic: documents?.filter(d => d.verification_status === 'authentic').length || 0,
      modified: documents?.filter(d => d.verification_status === 'modified').length || 0,
      pending: documents?.filter(d => d.verification_status === 'anchored').length || 0,
      verificationRate: documents?.length > 0 
        ? Math.round((documents.filter(d => d.verification_status === 'authentic').length / documents.length) * 100)
        : 0
    };

    // 3. 🎯 FORMATAGE DES DOCUMENTS AVEC URL DE TÉLÉCHARGEMENT
    const formattedDocuments = documents?.map(doc => ({
      ...doc,
      downloadUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${doc.storage_path}`,
      explorerUrl: doc.hedera_transaction_id ? `https://hashscan.io/testnet/transaction/${doc.hedera_transaction_id}` : null,
      shortHash: doc.file_hash ? doc.file_hash.substring(0, 16) + '...' : 'N/A'
    })) || [];

    return res.status(200).json({
      success: true,
      documents: formattedDocuments,
      statistics: stats,
      user: { id: userId },
      message: `📊 ${stats.total} document(s) trouvé(s) - ${stats.verificationRate}% authentiques`
    });

  } catch (error) {
    console.error("❌ Erreur récupération documents:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 4. RÉCUPÉRATION D'UN DOCUMENT SPÉCIFIQUE
 DESCRIPTION:
 * - Récupère les détails complets d'un document spécifique
 * - Inclut toutes les preuves d'authenticité
 * - Permet de vérifier un document individuellement
 */
export const getDocumentDetails = async (req, res) => {
  try {
    const { documentId } = req.params;

    if (!documentId) {
      return res.status(400).json({
        success: false,
        error: "ID document requis"
      });
    }

    // 1. RÉCUPÉRATION DU DOCUMENT
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !document) {
      return res.status(404).json({
        success: false,
        error: "Document non trouvé"
      });
    }

    // 2. VÉRIFICATION HEDERA (optionnelle)
    let hederaVerification = null;
    try {
      const query = new FileContentsQuery()
        .setFileId(FileId.fromString(document.hedera_file_id));
      
      const hederaHash = (await query.execute(hederaClient)).toString();
      hederaVerification = {
        hashMatch: hederaHash === document.file_hash,
        lastChecked: new Date().toISOString()
      };
    } catch (error) {
      hederaVerification = { error: error.message };
    }

    // 3. FORMATAGE DE LA RÉPONSE
    const response = {
      success: true,
      document: {
        ...document,
        downloadUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${document.storage_path}`,
        explorerUrl: `https://hashscan.io/testnet/transaction/${document.hedera_file_id}`
      },
      verification: {
        status: document.verification_status,
        lastVerified: document.last_verified_at,
        totalVerifications: document.verification_count || 0,
        hedera: hederaVerification
      },
      proof: {
        hederaFileId: document.hedera_file_id,
        fileHash: document.file_hash,
        anchoredDate: document.anchored_at
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error("❌ Erreur détails document:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 🗑️ 5. SUPPRESSION D'UN DOCUMENT
 *  DESCRIPTION:
 * - Supprime un document (stockage + métadonnées)
 * - Attention: l'ancrage Hedera reste (immuable)
 */
export const deleteDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { userId } = req.body; // Sécurité: vérifier que l'user possède le doc

    if (!documentId || !userId) {
      return res.status(400).json({
        success: false,
        error: "ID document et utilisateur requis"
      });
    }

    // 1. 🔍 VÉRIFIER QUE LE DOCUMENT APPARTIENT À L'UTILISATEUR
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('storage_path')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single();

    if (docError || !document) {
      return res.status(404).json({
        success: false,
        error: "Document non trouvé ou accès non autorisé"
      });
    }

    // 2. 🗑️ SUPPRESSION DU FICHIER STOCKAGE
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([document.storage_path]);

    if (storageError) {
      console.warn("⚠️ Impossible de supprimer le fichier storage:", storageError);
    }

    // 3. 🗑️ SUPPRESSION DES MÉTADONNÉES
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', documentId);

    if (dbError) throw dbError;

    return res.status(200).json({
      success: true,
      message: "✅ Document supprimé avec succès",
      note: "L'ancrage Hedera reste actif (immuable)"
    });

  } catch (error) {
    console.error("❌ Erreur suppression document:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * 📈 6. STATISTIQUES GLOBALES UTILISATEUR
 * 
 * 📋 DESCRIPTION:
 * - Statistiques détaillées sur les documents et vérifications
 * - Tableau de bord pour l'utilisateur
 */
export const getUserStats = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: documents, error } = await supabase
      .from('documents')
      .select('verification_status, file_size, created_at')
      .eq('user_id', userId);

    if (error) throw error;

    const stats = {
      totalDocuments: documents?.length || 0,
      totalSize: documents?.reduce((acc, doc) => acc + (doc.file_size || 0), 0) || 0,
      byStatus: {
        authentic: documents?.filter(d => d.verification_status === 'authentic').length || 0,
        modified: documents?.filter(d => d.verification_status === 'modified').length || 0,
        anchored: documents?.filter(d => d.verification_status === 'anchored').length || 0
      },
      recentActivity: documents?.slice(0, 5).map(d => ({
        date: d.created_at,
        status: d.verification_status
      }))
    };

    return res.status(200).json({
      success: true,
      stats: stats,
      user: { id: userId }
    });

  } catch (error) {
    console.error("❌ Erreur statistiques:", error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};


// 📦  EXPORT DE TOUS LES CONTROLLERS
export default {
  uploadAndAnchorDocument,
  verifyDocumentAuthenticity,
  getUserDocuments,
  getDocumentDetails,
  deleteDocument,
  getUserStats
};