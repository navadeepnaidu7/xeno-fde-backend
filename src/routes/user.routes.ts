import { Router, Request, Response } from 'express';
import { userController } from '../controllers/user.controller';

const router = Router();

// GET /api/users - Get all users
router.get('/', userController.getAll);

// GET /api/users/:id - Get user by ID
router.get('/:id', userController.getById);

// POST /api/users - Create a new user
router.post('/', userController.create);

// PUT /api/users/:id - Update a user
router.put('/:id', userController.update);

// DELETE /api/users/:id - Delete a user
router.delete('/:id', userController.delete);

export default router;
