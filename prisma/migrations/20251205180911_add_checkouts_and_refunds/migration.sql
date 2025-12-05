-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('PENDING', 'COMPLETED', 'ABANDONED');

-- CreateTable
CREATE TABLE "Checkout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopifyCheckoutId" TEXT NOT NULL,
    "shopifyCartToken" TEXT,
    "email" TEXT,
    "totalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CheckoutStatus" NOT NULL DEFAULT 'PENDING',
    "lineItemsCount" INTEGER NOT NULL DEFAULT 0,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "shopifyRefundId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkout_tenantId_status_idx" ON "Checkout"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Checkout_tenantId_createdAt_idx" ON "Checkout"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Checkout_tenantId_email_idx" ON "Checkout"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_tenantId_shopifyCheckoutId_key" ON "Checkout"("tenantId", "shopifyCheckoutId");

-- CreateIndex
CREATE INDEX "Refund_tenantId_createdAt_idx" ON "Refund"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_tenantId_shopifyRefundId_key" ON "Refund"("tenantId", "shopifyRefundId");

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
