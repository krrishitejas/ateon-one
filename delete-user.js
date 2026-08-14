import { prisma } from './src/lib/prisma.ts';

async function deleteUser() {
  try {
    await prisma.user.delete({ where: { email: 'shiva@ateonlabs.com' } });
    console.log('Deleted shiva@ateonlabs.com');
  } catch (err) {
    console.error(err);
  }
}
deleteUser();
