import prisma from '../lib/prisma';

interface CreateUserInput {
  email: string;
  name?: string;
}

interface UpdateUserInput {
  email?: string;
  name?: string;
}

export const userService = {
  async findAll() {
    return prisma.user.findMany();
  },

  async findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  async create(data: CreateUserInput) {
    return prisma.user.create({
      data,
    });
  },

  async update(id: string, data: UpdateUserInput) {
    return prisma.user.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    return prisma.user.delete({
      where: { id },
    });
  },
};
