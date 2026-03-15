import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting content cleanup...')

  // 1. Delete ArtworkInstances (depend on Artwork and ExhibitionVersion)
  const deletedInstances = await prisma.artworkInstance.deleteMany({})
  console.log(`Deleted ${deletedInstances.count} ArtworkInstances.`)

  // 2. Delete Artworks (depend on Asset)
  const deletedArtworks = await prisma.artwork.deleteMany({})
  console.log(`Deleted ${deletedArtworks.count} Artworks.`)

  // 3. Delete Assets
  const deletedAssets = await prisma.asset.deleteMany({})
  console.log(`Deleted ${deletedAssets.count} Assets.`)

  // Optional: Check if we should delete ExhibitionVersions?
  // User asked to "leave the user data". Exhibitions might be considered system structure or user data.
  // Given the previous context, the user is likely testing placement.
  // I will leave Exhibition and ExhibitionVersion for now to avoid breaking the editor.
  
  console.log('Cleanup complete. User data preserved.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
