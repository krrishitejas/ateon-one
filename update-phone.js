import { prisma } from './src/lib/prisma.ts';

async function updatePhone() {
  await prisma.user.update({
    where: { email: 'shiva@ateonlabs.com' },
    data: { phone: '+91 80887 53477' }
  });
  console.log('Updated phone');
}
updatePhone();
