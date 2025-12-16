import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing content data...');

  // Delete in order of dependency
  await prisma.artworkInstance.deleteMany({});
  await prisma.artwork.deleteMany({});
  await prisma.asset.deleteMany({});

  console.log('✅ Content cleared: ArtworkInstance, Artwork, Asset');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
