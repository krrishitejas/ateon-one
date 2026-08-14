import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'lekhakgowdacr25@ateonlabs.com';
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    console.log(`User ${email} not found in the database.`);
    return;
  }

  const newPassword = 'Password@123';
  const hash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { email },
    data: { passwordHash: hash }
  });

  console.log(`Password for ${email} has been reset to: ${newPassword}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
