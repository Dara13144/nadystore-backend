const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Searching for packages containing "DM"...');
  const packages = await prisma.package.findMany({
    where: {
      name: {
        contains: 'DM',
      },
    },
  });

  console.log(`Found ${packages.length} packages to update.`);

  let updatedCount = 0;
  for (const pkg of packages) {
    // Replace whole word 'DM' or ' DM' with ' Diamonds'
    const newName = pkg.name.replace(/\bDM\b/g, 'Diamonds').trim();
    if (newName !== pkg.name) {
      await prisma.package.update({
        where: { id: pkg.id },
        data: { name: newName },
      });
      console.log(`[UPDATED] "${pkg.name}" -> "${newName}" ($${pkg.price})`);
      updatedCount++;
    }
  }

  console.log(`\nSuccessfully updated ${updatedCount} packages from "DM" to "Diamonds"!`);
}

main()
  .catch((err) => {
    console.error('Error updating packages:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
