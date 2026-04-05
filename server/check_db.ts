import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const artworks = await prisma.artwork.findMany({ include: { asset: true } });
    console.log('\n--- Artworks ---');
    console.log(JSON.stringify(artworks, null, 2));

    const assets = await prisma.asset.findMany();
    console.log('\n--- Assets ---');
    console.log(JSON.stringify(assets, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
