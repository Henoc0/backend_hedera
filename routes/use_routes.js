// routes/documentRoutes.js
import express from 'express';
import {uploadAndAnchorDocument,verifyDocumentAuthenticity,getUserDocuments,getDocumentDetails,deleteDocument,getUserStats} from '../controllers/documentController.js';

const router = express.Router();


 //  UPLOAD + ANCRAGE COMPLET
 //  POST /api/documents/upload

router.post('/upload', uploadAndAnchorDocument);


 // VÉRIFICATION AUTHENTICITÉ (avec Hedera)
 // POST /api/documents/verify/:hederaFileId
 
router.post('/verify/:hederaFileId', verifyDocumentAuthenticity);

/**
 *  LISTE DOCUMENTS UTILISATEUR (pour recherche/filtrage frontend)
 * GET /api/documents/user/:userId
 */
router.get('/user/:userId', getUserDocuments);

/**
 * DÉTAILS D'UN DOCUMENT SPÉCIFIQUE
 * GET /api/documents/:documentId
 */
router.get('/:documentId', getDocumentDetails);

/**
 * SUPPRESSION DOCUMENT
 * DELETE /api/documents/:documentId
 */
router.delete('/:documentId', deleteDocument);

/**
 * STATISTIQUES UTILISATEUR
 * GET /api/documents/user/:userId/stats
 */
router.get('/user/:userId/stats', getUserStats);


/**
 * VÉRIFICATION DISPONIBILITÉ API
 * GET /api/documents/health
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Document Authentication API'
  });
});

export default router;


