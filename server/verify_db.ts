import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('Successfully connected to the database.');
    
    // Check if we can query the User table (even if empty)
    const count = await prisma.user.count();
    console.log(`User count: ${count}`);
    
  } catch (e) {
    console.error('Failed to connect to database:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
