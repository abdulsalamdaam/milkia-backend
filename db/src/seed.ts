import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, propertiesTable, unitsTable, contractsTable, paymentsTable } from "./index";

async function seed() {
  console.log("Starting seed...");

  const adminEmail = "admin@platform.com";
  const demoEmail = "demo@platform.com";

  const existingAdmin = await db.select().from(usersTable).where(eq(usersTable.email, adminEmail));
  if (existingAdmin.length === 0) {
    const adminHash = await bcrypt.hash("admin123", 10);
    await db.insert(usersTable).values({
      email: adminEmail,
      passwordHash: adminHash,
      name: "مدير المنصة",
      role: "super_admin",
      isActive: true,
      accountStatus: "active",
    });
    console.log("Admin created: admin@platform.com / admin123");
  } else {
    console.log("Admin already exists");
  }

  const existingDemo = await db.select().from(usersTable).where(eq(usersTable.email, demoEmail));
  let demoUserId: number;

  if (existingDemo.length === 0) {
    const demoHash = await bcrypt.hash("demo123", 10);
    const [demoUser] = await db.insert(usersTable).values({
      email: demoEmail,
      passwordHash: demoHash,
      name: "مستخدم تجريبي",
      role: "demo",
      isActive: true,
      accountStatus: "active",
    }).returning();
    demoUserId = demoUser!.id;
    console.log("Demo created: demo@platform.com / demo123");
  } else {
    demoUserId = existingDemo[0]!.id;
    const existingProps = await db.select().from(propertiesTable).where(eq(propertiesTable.userId, demoUserId));
    if (existingProps.length > 0) {
      console.log("Demo data already seeded — exiting.");
      process.exit(0);
    }
  }

  const [prop1] = await db.insert(propertiesTable).values({
    userId: demoUserId, name: "مجمع الياسمين السكني", type: "residential",
    status: "active", city: "الرياض", district: "حي الياسمين",
    street: "شارع الورود", deedNumber: "1234567890", totalUnits: 12,
    buildingType: "عمارة سكنية", usageType: "سكني", floors: 4, elevators: 2, parkings: 10,
    isDemo: true,
  }).returning();

  const [prop2] = await db.insert(propertiesTable).values({
    userId: demoUserId, name: "برج الأعمال التجاري", type: "commercial",
    status: "active", city: "جدة", district: "حي الشاطئ",
    street: "شارع الكورنيش", deedNumber: "0987654321", totalUnits: 8,
    buildingType: "برج تجاري", usageType: "تجاري", floors: 8, elevators: 3, parkings: 20,
    isDemo: true,
  }).returning();

  const [prop3] = await db.insert(propertiesTable).values({
    userId: demoUserId, name: "فيلا النخيل السكنية", type: "villa",
    status: "active", city: "الرياض", district: "حي النخيل", totalUnits: 1,
    buildingType: "فيلا مستقلة", usageType: "سكني", floors: 2, elevators: 0, parkings: 4,
    isDemo: true,
  }).returning();

  const units1 = await db.insert(unitsTable).values([
    { propertyId: prop1!.id, unitNumber: "101", type: "apartment", status: "rented", floor: 1, bedrooms: 3, bathrooms: 2, area: "120.00", rentPrice: "2500.00", isDemo: true },
    { propertyId: prop1!.id, unitNumber: "102", type: "apartment", status: "rented", floor: 1, bedrooms: 2, bathrooms: 1, area: "90.00", rentPrice: "1800.00", isDemo: true },
    { propertyId: prop1!.id, unitNumber: "201", type: "apartment", status: "available", floor: 2, bedrooms: 3, bathrooms: 2, area: "120.00", rentPrice: "2600.00", isDemo: true },
    { propertyId: prop1!.id, unitNumber: "202", type: "apartment", status: "rented", floor: 2, bedrooms: 4, bathrooms: 3, area: "150.00", rentPrice: "3200.00", isDemo: true },
    { propertyId: prop1!.id, unitNumber: "301", type: "apartment", status: "maintenance", floor: 3, bedrooms: 2, bathrooms: 1, area: "90.00", rentPrice: "1900.00", isDemo: true },
  ]).returning();

  const units2 = await db.insert(unitsTable).values([
    { propertyId: prop2!.id, unitNumber: "A01", type: "office", status: "rented", floor: 1, area: "80.00", rentPrice: "3500.00", isDemo: true },
    { propertyId: prop2!.id, unitNumber: "B01", type: "shop", status: "available", floor: 1, area: "60.00", rentPrice: "2800.00", isDemo: true },
    { propertyId: prop2!.id, unitNumber: "C01", type: "office", status: "rented", floor: 2, area: "100.00", rentPrice: "4200.00", isDemo: true },
  ]).returning();

  const units3 = await db.insert(unitsTable).values([
    { propertyId: prop3!.id, unitNumber: "V01", type: "villa", status: "rented", bedrooms: 5, bathrooms: 4, area: "350.00", rentPrice: "8000.00", isDemo: true },
  ]).returning();

  const today = new Date();
  const startDate = new Date(today.getFullYear(), 0, 1).toISOString().split("T")[0]!;
  const endDate = new Date(today.getFullYear(), 11, 31).toISOString().split("T")[0]!;

  const rentedUnits = [units1[0]!, units1[1]!, units1[3]!, units2[0]!, units2[2]!, units3[0]!];
  const tenants = [
    { name: "أحمد محمد العتيبي", idNumber: "1234567890", phone: "0501234567" },
    { name: "خالد عبدالله السالم", idNumber: "1098765432", phone: "0557654321" },
    { name: "فيصل سعود الحربي", idNumber: "1122334455", phone: "0543219876" },
    { name: "شركة الأفق للاستشارات", idNumber: "7001234567", phone: "0112345678" },
    { name: "مكتب النجوم للمحاماة", idNumber: "7009876543", phone: "0126543210" },
    { name: "سلطان ناصر القحطاني", idNumber: "1556677889", phone: "0509988776" },
  ];

  const contracts = await db.insert(contractsTable).values(rentedUnits.map((unit, i) => ({
    userId: demoUserId,
    unitId: unit.id,
    contractNumber: `EQ-2024-${100 + i}`,
    tenantName: tenants[i]!.name,
    tenantIdNumber: tenants[i]!.idNumber,
    tenantPhone: tenants[i]!.phone,
    startDate,
    endDate,
    monthlyRent: unit.rentPrice!,
    paymentFrequency: "monthly" as const,
    depositAmount: String(parseFloat(unit.rentPrice!) * 2),
    status: "active" as const,
    isDemo: true,
  }))).returning();

  const cm = String(today.getMonth() + 1).padStart(2, "0");
  const pm = today.getMonth() === 0 ? "12" : String(today.getMonth()).padStart(2, "0");
  const cy = today.getFullYear();
  const py = today.getMonth() === 0 ? cy - 1 : cy;

  const dueDate1 = `${cy}-${cm}-01`;
  const dueDate2 = `${py}-${pm}-01`;

  await db.insert(paymentsTable).values(contracts.flatMap((contract, i) => [
    { userId: demoUserId, contractId: contract.id, amount: contract.monthlyRent, dueDate: dueDate1, paidDate: null, status: i < 4 ? "pending" as const : "overdue" as const, isDemo: true },
    { userId: demoUserId, contractId: contract.id, amount: contract.monthlyRent, dueDate: dueDate2, paidDate: dueDate2, status: "paid" as const, receiptNumber: `REC-${2024100 + i}`, isDemo: true },
  ]));

  console.log("Seed completed.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
