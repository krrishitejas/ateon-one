import { prisma } from './src/lib/prisma.ts';

async function check() {
  const user = await prisma.user.findUnique({ where: { email: 'shiva@ateonlabs.com' } });
  console.log(user);
}
check();
