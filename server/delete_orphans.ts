import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
    // Delete all artworks that have no asset OR belong to the global asset
    const artworks = await prisma.artwork.deleteMany({
        where: {}
    });
    console.log(`Deleted ${artworks.count} orphaned artworks.`);

    // Delete all assets
    const assets = await prisma.asset.findMany();
    for (const asset of assets) {
        const filepath = path.resolve(process.cwd(), '../', asset.path.replace(/^\//, ''));
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
        }
    }

    const deletedAssets = await prisma.asset.deleteMany({
        where: {}
    });
    console.log(`Deleted ${deletedAssets.count} global assets.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
