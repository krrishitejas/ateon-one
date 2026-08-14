import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const state = await prisma.appState.findUnique({
    where: { key: 'ateon_global_state' }
  });
  
  if (state && state.data) {
    const data = state.data as any;
    if (data.projects) {
      const beforeCount = data.projects.length;
      data.projects = data.projects.filter((p: any) => !p.name.includes('OmegaMTL'));
      const afterCount = data.projects.length;
      
      console.log(`Filtered projects from ${beforeCount} to ${afterCount}`);
      
      await prisma.appState.update({
        where: { key: 'ateon_global_state' },
        data: { data }
      });
      console.log('Database updated.');
    }
  } else {
    console.log('No global state found.');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
