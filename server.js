import express from 'express';
import cors from 'cors';
import documentRoutes from './routes/use_routes.js';

const app = express();

// MIDDLEWARES 
app.use(cors());  // Autorise les requêtes frontend
app.use(express.json({limit : '25mb'}));  // Parse les données JSON et controle la taille des fichiers 
app.use(express.urlencoded({ extended: false, limit : '25mb' }));  // Parse les formulaires et controle la taille des fichiers


//  ROUTES PRINCIPALES
app.use('/api/documents', documentRoutes);  // Importer les routes


// DÉMARRAGE SERVEUR
const PORT = 3001;
app.listen(PORT, () => {
  console.log(` Backend Hedera démarré sur http://localhost:${PORT}`);
  console.log(` API Documents: http://localhost:${PORT}/api/documents`);
});

// nodemon C:\Users\HP\Desktop\Henoc.k\educred-vault-main\backend\server.js