import { Router } from 'express';
import userRoutes from './user.routes';

const router = Router();

router.use('/users', userRoutes);

// Add more routes here as needed
// router.use('/posts', postRoutes);

export default router;
