import { prisma } from './src/lib/prisma.ts';

async function test() {
  try {
    const user = await prisma.user.create({
      data: {
        email: 'test-cto@ateonlabs.com',
        name: 'Test CTO',
        role: 'cto',
        passwordHash: 'dummy',
        department: 'General',
        designation: 'CTO',
        avatar: '',
      }
    });
    console.log('Created:', user);
    await prisma.user.delete({ where: { id: user.id } });
  } catch (err) {
    console.error('Prisma Error:', err);
  }
}
test();
