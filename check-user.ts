import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'lekhakgowdacr25@ateonlabs.com';
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    console.log(`User ${email} not found.`);
  } else {
    console.log('User details:', user);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
