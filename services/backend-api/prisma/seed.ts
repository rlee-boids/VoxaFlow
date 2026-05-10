import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenants = [
    {
      id: "tenant_demo_homecare",
      name: "Demo Home Care",
      status: "active",
      defaultVertical: "home_care",
      plan: "starter"
    },
    {
      id: "tenant_demo_transport",
      name: "Demo Transportation",
      status: "active",
      defaultVertical: "transportation",
      plan: "starter"
    }
  ];

  for (const tenant of tenants) {
    await prisma.tenant.upsert({
      where: { id: tenant.id },
      update: tenant,
      create: tenant
    });
  }

  await prisma.client.upsert({
    where: { id: "client_demo_homecare" },
    update: {
      tenantId: "tenant_demo_homecare",
      businessName: "Demo Home Care",
      vertical: "home_care",
      timezone: "America/Los_Angeles"
    },
    create: {
      id: "client_demo_homecare",
      tenantId: "tenant_demo_homecare",
      businessName: "Demo Home Care",
      vertical: "home_care",
      timezone: "America/Los_Angeles",
      settingsJson: {}
    }
  });

  await prisma.client.upsert({
    where: { id: "client_demo_transportation" },
    update: {
      tenantId: "tenant_demo_transport",
      businessName: "Demo Transportation",
      vertical: "transportation",
      timezone: "America/Los_Angeles"
    },
    create: {
      id: "client_demo_transportation",
      tenantId: "tenant_demo_transport",
      businessName: "Demo Transportation",
      vertical: "transportation",
      timezone: "America/Los_Angeles",
      settingsJson: {}
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
